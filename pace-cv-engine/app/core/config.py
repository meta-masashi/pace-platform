"""Application configuration via environment variables (ADR-013)."""
from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Service identity ──────────────────────────────────────
    service_name: str = "pace-cv-engine"
    environment: str = Field(default="development", alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # ── AWS ───────────────────────────────────────────────────
    aws_region: str = Field(default="ap-northeast-1", alias="AWS_REGION")
    s3_raw_bucket: str = Field(..., alias="S3_RAW_BUCKET")
    s3_masked_bucket: str = Field(..., alias="S3_MASKED_BUCKET")
    sqs_job_queue_url: str = Field(..., alias="SQS_JOB_QUEUE_URL")

    # ── Supabase ──────────────────────────────────────────────
    supabase_url: str = Field(..., alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")

    # ── Sentry ───────────────────────────────────────────────
    sentry_dsn: str = Field(default="", alias="SENTRY_DSN")

    # ── CV Engine tuning ──────────────────────────────────────
    # Face masking blur kernel size (must be odd)
    face_blur_kernel: int = Field(default=99, alias="FACE_BLUR_KERNEL")
    # MediaPipe pose model complexity: 0=Lite, 1=Full, 2=Heavy
    pose_model_complexity: int = Field(default=1, alias="POSE_MODEL_COMPLEXITY")
    # Max video duration accepted (seconds)
    max_video_duration_sec: int = Field(default=300, alias="MAX_VIDEO_DURATION_SEC")
    # Max file size (bytes) — default 500 MB
    max_file_size_bytes: int = Field(default=500 * 1024 * 1024, alias="MAX_FILE_SIZE_BYTES")

    # ── Worker ───────────────────────────────────────────────
    worker_concurrency: int = Field(default=1, alias="WORKER_CONCURRENCY")
    sqs_visibility_timeout: int = Field(default=300, alias="SQS_VISIBILITY_TIMEOUT")
    sqs_max_messages: int = Field(default=1, alias="SQS_MAX_MESSAGES")


settings = Settings()
