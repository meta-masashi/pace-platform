"""SQS long-polling consumer loop (ADR-015).

Polls SQS job queue, deserializes messages, delegates to CVJobProcessor.
Runs in foreground (one process per ECS task).
"""
from __future__ import annotations

import json
import signal
import sys
import time

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings
from app.core.logging import get_logger
from app.models.cv_job import SQSJobMessage
from app.services.job_processor import CVJobProcessor

logger = get_logger(__name__)


class SQSConsumer:
    """Long-polling SQS consumer for CV job queue."""

    def __init__(self) -> None:
        self._sqs = boto3.client("sqs", region_name=settings.aws_region)
        self._processor = CVJobProcessor()
        self._running = False

    def start(self) -> None:
        """Start the consumer loop. Blocks until SIGTERM/SIGINT."""
        self._running = True
        signal.signal(signal.SIGTERM, self._handle_shutdown)
        signal.signal(signal.SIGINT, self._handle_shutdown)

        logger.info("sqs_consumer_started",
                    queue_url=settings.sqs_job_queue_url,
                    visibility_timeout=settings.sqs_visibility_timeout)

        while self._running:
            try:
                self._poll_once()
            except Exception as exc:
                logger.error("poll_error", error=str(exc))
                time.sleep(5)  # Back-off on unexpected error

    def _poll_once(self) -> None:
        """Receive up to max_messages from SQS and process each."""
        try:
            response = self._sqs.receive_message(
                QueueUrl=settings.sqs_job_queue_url,
                MaxNumberOfMessages=settings.sqs_max_messages,
                WaitTimeSeconds=20,  # Long-polling
                VisibilityTimeout=settings.sqs_visibility_timeout,
                MessageAttributeNames=["All"],
            )
        except ClientError as e:
            logger.error("sqs_receive_failed", error=str(e))
            time.sleep(10)
            return

        messages = response.get("Messages", [])
        if not messages:
            return  # Queue empty, loop again

        for msg in messages:
            receipt_handle = msg["ReceiptHandle"]
            try:
                body = json.loads(msg["Body"])
                job_msg = SQSJobMessage(**body)
                self._processor.process(job_msg)
                # Delete only on success
                self._delete_message(receipt_handle)
            except Exception as exc:
                logger.error(
                    "message_processing_failed",
                    message_id=msg.get("MessageId"),
                    error=str(exc),
                )
                # Do NOT delete — SQS will re-deliver after visibility timeout
                # After max receive count, SQS sends to DLQ

    def _delete_message(self, receipt_handle: str) -> None:
        try:
            self._sqs.delete_message(
                QueueUrl=settings.sqs_job_queue_url,
                ReceiptHandle=receipt_handle,
            )
        except ClientError as e:
            logger.warning("sqs_delete_failed", error=str(e))

    def _handle_shutdown(self, signum, frame) -> None:
        logger.info("sqs_consumer_shutdown_signal", signal=signum)
        self._running = False
        sys.exit(0)
