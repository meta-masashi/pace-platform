"""PACE CV Engine — FastAPI application entrypoint (ADR-013)."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.health import router as health_router
from app.api.v1.jobs import router as jobs_router
from app.core.config import settings
from app.core.logging import configure_logging, get_logger


# ── Logging setup (must be before any logger usage) ──────────────────
configure_logging()
logger = get_logger(__name__)


# ── Sentry initialization ─────────────────────────────────────────────
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
    )
    logger.info("sentry_initialized", environment=settings.environment)


# ── Application lifecycle ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info(
        "pace_cv_engine_starting",
        environment=settings.environment,
        pose_model_complexity=settings.pose_model_complexity,
        face_blur_kernel=settings.face_blur_kernel,
    )
    yield
    logger.info("pace_cv_engine_shutdown")


# ── FastAPI app ───────────────────────────────────────────────────────
app = FastAPI(
    title="PACE CV Engine",
    description="Computer Vision microservice for athlete video analysis",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

# Internal-only: no public CORS needed, but allow localhost for dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8080"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────
app.include_router(health_router)
app.include_router(jobs_router, prefix="/api/v1")
