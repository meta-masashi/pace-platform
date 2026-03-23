"""Worker entrypoint — starts SQS consumer loop.

Run with: python -m app.worker
Or via Dockerfile CMD override for worker mode.
"""
from __future__ import annotations

from app.core.logging import configure_logging, get_logger
from app.services.sqs_consumer import SQSConsumer

configure_logging()
logger = get_logger(__name__)


def main() -> None:
    logger.info("worker_starting")
    consumer = SQSConsumer()
    consumer.start()


if __name__ == "__main__":
    main()
