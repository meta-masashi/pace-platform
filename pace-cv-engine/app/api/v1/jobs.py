"""CV job management endpoints (internal API for Next.js backend)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

import boto3
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/jobs", tags=["jobs"])


class SubmitJobRequest(BaseModel):
    athlete_id: UUID
    team_id: UUID
    video_upload_id: UUID
    raw_video_s3_key: str


class SubmitJobResponse(BaseModel):
    job_id: UUID
    status: str
    message: str


@router.post("/submit", response_model=SubmitJobResponse)
async def submit_job(
    req: SubmitJobRequest,
    x_internal_token: Optional[str] = Header(default=None),
) -> SubmitJobResponse:
    """Submit a new CV analysis job to SQS queue.
    
    Called by Next.js Edge Function after video upload confirmation.
    Requires X-Internal-Token header for service-to-service auth.
    """
    # Service-to-service auth
    import os
    expected_token = os.environ.get("CV_INTERNAL_TOKEN", "")
    if not expected_token or x_internal_token != expected_token:
        raise HTTPException(status_code=401, detail="Invalid internal token")

    job_id = uuid4()
    sqs = boto3.client("sqs", region_name=settings.aws_region)

    import json
    message_body = json.dumps({
        "job_id": str(job_id),
        "athlete_id": str(req.athlete_id),
        "team_id": str(req.team_id),
        "video_upload_id": str(req.video_upload_id),
        "raw_video_s3_key": req.raw_video_s3_key,
        "upload_timestamp": datetime.now(timezone.utc).isoformat(),
    })

    try:
        sqs.send_message(
            QueueUrl=settings.sqs_job_queue_url,
            MessageBody=message_body,
            MessageGroupId=str(req.athlete_id),  # FIFO queue grouping by athlete
        )
    except Exception as e:
        logger.error("sqs_submit_failed", error=str(e))
        raise HTTPException(status_code=503, detail="Job queue unavailable")

    logger.info("job_submitted", job_id=str(job_id),
                athlete_id=str(req.athlete_id))

    return SubmitJobResponse(
        job_id=job_id,
        status="queued",
        message="CV analysis job queued successfully",
    )
