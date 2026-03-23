"""CV job processor — orchestrates the full video analysis pipeline.

Pipeline (ADR-013, ADR-015):
  SQS message → download raw → face mask → pose estimate → 
  upload masked → update Supabase cv_jobs → tag raw for deletion
"""
from __future__ import annotations

import json
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.core.logging import get_logger
from app.models.cv_job import (
    CVJobResult,
    JobStatus,
    KinematicsVector,
    SQSJobMessage,
)
from app.services.face_masker import FaceMaskerService
from app.services.pose_estimator import PoseEstimatorService
from app.services.s3_service import S3Service

logger = get_logger(__name__)


class CVJobProcessor:
    """Processes one CV job end-to-end."""

    def __init__(self) -> None:
        self._s3 = S3Service()
        self._supabase_url = settings.supabase_url
        self._supabase_key = settings.supabase_service_role_key

    def process(self, message: SQSJobMessage) -> CVJobResult:
        """Run full pipeline for a single job. Raises on unrecoverable error."""
        job_id = message.job_id
        started_at = datetime.now(timezone.utc)

        logger.info("job_started", job_id=str(job_id),
                    athlete_id=str(message.athlete_id))

        # ── Mark job as PROCESSING ────────────────────────────────
        self._update_job_status(job_id, JobStatus.PROCESSING, started_at=started_at)

        with tempfile.TemporaryDirectory(prefix=f"pace_cv_{job_id}_") as tmpdir:
            tmp = Path(tmpdir)
            raw_path = tmp / "raw.mp4"
            masked_path = tmp / "masked.mp4"

            try:
                # Step 1: Download raw video from S3
                self._s3.download_raw_video(message.raw_video_s3_key, raw_path)

                # Step 2: Face masking (MUST run before pose analysis)
                with FaceMaskerService() as masker:
                    masking_stats = masker.mask_video(raw_path, masked_path)

                # Step 3: Pose estimation (on raw video — better keypoint quality)
                with PoseEstimatorService() as estimator:
                    keypoints, kinematics, cv_errors, rejection = estimator.analyze(raw_path)

                completed_at = datetime.now(timezone.utc)
                duration_sec = (completed_at - started_at).total_seconds()

                if rejection:
                    # Video rejected — still upload masked version if it was created
                    masked_key: str | None = None
                    if masked_path.exists():
                        masked_key = self._s3.upload_masked_video(
                            masked_path, job_id, message.athlete_id
                        )

                    result = CVJobResult(
                        job_id=job_id,
                        athlete_id=message.athlete_id,
                        video_upload_id=message.video_upload_id,
                        status=JobStatus.REJECTED,
                        started_at=started_at,
                        completed_at=completed_at,
                        processing_duration_sec=duration_sec,
                        rejection_reason=rejection,
                        masked_video_s3_key=masked_key,
                        raw_video_s3_key=message.raw_video_s3_key,
                    )
                    self._update_job_result(result)
                    return result

                # Step 4: Upload masked video to S3
                masked_key = self._s3.upload_masked_video(
                    masked_path, job_id, message.athlete_id
                )

                # Step 5: Tag raw video for 7-day expiry
                self._s3.tag_raw_for_deletion(message.raw_video_s3_key, job_id)

                # Step 6: Insert kinematics into biomechanical_vectors
                if kinematics:
                    self._insert_biomechanical_vector(
                        message.athlete_id, job_id, kinematics
                    )

                result = CVJobResult(
                    job_id=job_id,
                    athlete_id=message.athlete_id,
                    video_upload_id=message.video_upload_id,
                    status=JobStatus.COMPLETED,
                    started_at=started_at,
                    completed_at=completed_at,
                    processing_duration_sec=duration_sec,
                    keypoints_sample=keypoints[:10],  # Store 10 sample frames only
                    kinematics_vector=kinematics,
                    cv_errors=cv_errors,
                    masked_video_s3_key=masked_key,
                    raw_video_s3_key=message.raw_video_s3_key,
                )
                self._update_job_result(result)

                logger.info(
                    "job_completed",
                    job_id=str(job_id),
                    duration_sec=round(duration_sec, 1),
                    masking_rate=masking_stats.get("masking_rate"),
                    cv_errors_count=len(cv_errors) if cv_errors else 0,
                    kinematics_confidence=kinematics.confidence_score if kinematics else 0,
                )
                return result

            except Exception as exc:
                completed_at = datetime.now(timezone.utc)
                duration_sec = (completed_at - started_at).total_seconds()
                logger.error("job_failed", job_id=str(job_id), error=str(exc))

                result = CVJobResult(
                    job_id=job_id,
                    athlete_id=message.athlete_id,
                    video_upload_id=message.video_upload_id,
                    status=JobStatus.FAILED,
                    started_at=started_at,
                    completed_at=completed_at,
                    processing_duration_sec=duration_sec,
                )
                self._update_job_result(result)
                raise

    # ── Supabase REST API calls ────────────────────────────────────────

    def _supabase_headers(self) -> dict:
        return {
            "apikey": self._supabase_key,
            "Authorization": f"Bearer {self._supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

    def _update_job_status(
        self,
        job_id: UUID,
        status: JobStatus,
        started_at: datetime | None = None,
    ) -> None:
        payload: dict = {"status": status.value}
        if started_at:
            payload["started_at"] = started_at.isoformat()

        with httpx.Client(timeout=10.0) as client:
            resp = client.patch(
                f"{self._supabase_url}/rest/v1/cv_jobs",
                headers=self._supabase_headers(),
                params={"id": f"eq.{job_id}"},
                json=payload,
            )
            resp.raise_for_status()

    def _update_job_result(self, result: CVJobResult) -> None:
        payload = {
            "status": result.status.value,
            "completed_at": result.completed_at.isoformat() if result.completed_at else None,
            "processing_duration_sec": result.processing_duration_sec,
            "masked_video_s3_key": result.masked_video_s3_key,
            "rejection_reason": result.rejection_reason.value if result.rejection_reason else None,
            "result_payload": result.model_dump(
                exclude={"job_id", "athlete_id", "video_upload_id"},
                mode="json",
            ),
        }

        with httpx.Client(timeout=10.0) as client:
            resp = client.patch(
                f"{self._supabase_url}/rest/v1/cv_jobs",
                headers=self._supabase_headers(),
                params={"id": f"eq.{result.job_id}"},
                json=payload,
            )
            resp.raise_for_status()

    def _insert_biomechanical_vector(
        self,
        athlete_id: UUID,
        job_id: UUID,
        kinematics: KinematicsVector,
    ) -> None:
        """Insert CV-derived kinematics into biomechanical_vectors table."""
        import json

        payload = {
            "athlete_id": str(athlete_id),
            "source": "cv_analysis",
            "kinematics_vector": kinematics.vector,
            "confidence_score": kinematics.confidence_score,
            "frame_count": kinematics.frame_count,
            "cv_job_id": str(job_id),
        }

        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"{self._supabase_url}/rest/v1/biomechanical_vectors",
                headers={**self._supabase_headers(), "Prefer": "return=minimal"},
                json=payload,
            )
            if resp.status_code not in (200, 201):
                logger.warning(
                    "biomechanical_vector_insert_failed",
                    status=resp.status_code,
                    body=resp.text[:200],
                )
            else:
                logger.info("biomechanical_vector_inserted",
                            athlete_id=str(athlete_id), job_id=str(job_id))
