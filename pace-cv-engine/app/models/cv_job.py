"""Pydantic models for CV job lifecycle (ADR-013, ADR-015)."""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class JobStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"


class RejectionReason(StrEnum):
    ERR_ANGLE = "ERR_ANGLE"          # Camera angle outside acceptable range
    ERR_NO_PERSON = "ERR_NO_PERSON"  # No person detected in video
    ERR_TOO_SHORT = "ERR_TOO_SHORT"  # Video < 3 seconds
    ERR_TOO_LONG = "ERR_TOO_LONG"    # Video > max duration
    ERR_FORMAT = "ERR_FORMAT"        # Unsupported codec/container
    ERR_CORRUPT = "ERR_CORRUPT"      # Unreadable file


class Landmark(BaseModel):
    """Single MediaPipe pose landmark (normalized coords)."""
    x: float
    y: float
    z: float
    visibility: float


class FrameKeypoints(BaseModel):
    """Keypoints for one video frame."""
    frame_index: int
    timestamp_ms: float
    landmarks: list[Landmark] = Field(min_length=0, max_length=33)
    pose_detected: bool


class KinematicsVector(BaseModel):
    """128-dim biomechanical feature vector extracted from video.
    
    Matches biomechanical_vectors.kinematics_vector schema (Phase 2 activated).
    Dimensions 0–63: joint angles (mean/std per joint across frames)
    Dimensions 64–95: angular velocities
    Dimensions 96–127: symmetry & timing features
    """
    vector: list[float] = Field(min_length=128, max_length=128)
    frame_count: int
    confidence_score: float = Field(ge=0.0, le=1.0)


class CVErrorMetric(BaseModel):
    """Top-5 kinematic error injected into LLM context (ADR-009/ADR-016)."""
    error_type: str          # e.g., "knee_valgus", "trunk_lean_excess"
    severity: float          # 0.0–1.0
    affected_frames: int
    description: str
    recommendation: str


class CVJobResult(BaseModel):
    """Full CV analysis result stored in cv_jobs.result_payload."""
    job_id: UUID
    athlete_id: UUID
    video_upload_id: UUID
    status: JobStatus
    
    # Timing
    started_at: datetime
    completed_at: Optional[datetime] = None
    processing_duration_sec: Optional[float] = None
    
    # Video metadata
    video_duration_sec: Optional[float] = None
    frame_count: Optional[int] = None
    fps: Optional[float] = None
    
    # CV outputs
    keypoints_sample: Optional[list[FrameKeypoints]] = None  # sampled frames only
    kinematics_vector: Optional[KinematicsVector] = None
    cv_errors: Optional[list[CVErrorMetric]] = None
    rejection_reason: Optional[RejectionReason] = None
    
    # Storage refs
    masked_video_s3_key: Optional[str] = None
    raw_video_s3_key: Optional[str] = None


class SQSJobMessage(BaseModel):
    """Message body from SQS job queue (ADR-015)."""
    job_id: UUID
    athlete_id: UUID
    video_upload_id: UUID
    raw_video_s3_key: str
    upload_timestamp: datetime
    team_id: UUID
