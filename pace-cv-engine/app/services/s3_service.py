"""S3 upload/download service for video pipeline (ADR-007, ADR-015)."""
from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path
from typing import Optional
from uuid import UUID

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class S3Service:
    """Wrapper around boto3 S3 for CV pipeline operations."""

    def __init__(self) -> None:
        self._s3 = boto3.client("s3", region_name=settings.aws_region)

    # ── Download ─────────────────────────────────────────────────────

    def download_raw_video(self, s3_key: str, local_path: Path) -> None:
        """Download raw video from S3_RAW_BUCKET to local path."""
        logger.info("s3_download_start",
                    bucket=settings.s3_raw_bucket, key=s3_key)
        try:
            self._s3.download_file(
                Bucket=settings.s3_raw_bucket,
                Key=s3_key,
                Filename=str(local_path),
            )
            file_size = local_path.stat().st_size
            logger.info("s3_download_complete",
                        key=s3_key, size_bytes=file_size)
        except ClientError as e:
            logger.error("s3_download_failed", key=s3_key, error=str(e))
            raise

    # ── Upload ────────────────────────────────────────────────────────

    def upload_masked_video(
        self,
        local_path: Path,
        job_id: UUID,
        athlete_id: UUID,
    ) -> str:
        """Upload masked video to S3_MASKED_BUCKET.
        
        Returns the S3 key of the uploaded object.
        Key format: masked/{athlete_id}/{job_id}/masked.mp4
        """
        s3_key = f"masked/{athlete_id}/{job_id}/masked.mp4"
        file_size = local_path.stat().st_size

        logger.info("s3_upload_start",
                    bucket=settings.s3_masked_bucket,
                    key=s3_key,
                    size_bytes=file_size)

        try:
            self._s3.upload_file(
                Filename=str(local_path),
                Bucket=settings.s3_masked_bucket,
                Key=s3_key,
                ExtraArgs={
                    "ContentType": "video/mp4",
                    "ServerSideEncryption": "AES256",
                    "Metadata": {
                        "job-id": str(job_id),
                        "athlete-id": str(athlete_id),
                    },
                },
            )
            logger.info("s3_upload_complete", key=s3_key)
            return s3_key
        except ClientError as e:
            logger.error("s3_upload_failed", key=s3_key, error=str(e))
            raise

    # ── Presigned URL (for frontend streaming) ────────────────────────

    def generate_masked_video_url(
        self,
        s3_key: str,
        expiry_seconds: int = 3600,
    ) -> str:
        """Generate presigned GET URL for masked video (Before/After UI)."""
        url = self._s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_masked_bucket, "Key": s3_key},
            ExpiresIn=expiry_seconds,
        )
        logger.info("presigned_url_generated",
                    key=s3_key, expiry_seconds=expiry_seconds)
        return url

    # ── Lifecycle: delete raw after 7d (enforced by S3 lifecycle rule) ─

    def tag_raw_for_deletion(self, s3_key: str, job_id: UUID) -> None:
        """Tag raw video for 7-day expiry (ADR-008).
        
        Note: Primary deletion is handled by S3 lifecycle rule.
        This tag is supplementary for audit tracking.
        """
        try:
            self._s3.put_object_tagging(
                Bucket=settings.s3_raw_bucket,
                Key=s3_key,
                Tagging={
                    "TagSet": [
                        {"Key": "pace-job-id", "Value": str(job_id)},
                        {"Key": "pace-lifecycle", "Value": "raw-7d"},
                    ]
                },
            )
        except ClientError as e:
            # Non-fatal: lifecycle rule handles deletion
            logger.warning("raw_tagging_failed", key=s3_key, error=str(e))
