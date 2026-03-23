"""Health check endpoints."""
from __future__ import annotations

import platform
import sys
from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    """Liveness probe — returns 200 if service is running."""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "pace-cv-engine",
    }


@router.get("/health/ready")
async def readiness() -> dict:
    """Readiness probe — checks GPU/model availability."""
    checks: dict[str, str] = {}

    # Check MediaPipe import
    try:
        import mediapipe  # noqa: F401
        checks["mediapipe"] = "ok"
    except ImportError:
        checks["mediapipe"] = "unavailable"

    # Check OpenCV
    try:
        import cv2  # noqa: F401
        checks["opencv"] = "ok"
    except ImportError:
        checks["opencv"] = "unavailable"

    # Check GPU (CUDA via cv2)
    try:
        import cv2
        cuda_count = cv2.cuda.getCudaEnabledDeviceCount()
        checks["cuda"] = f"{cuda_count} device(s)"
    except Exception:
        checks["cuda"] = "not_available"

    all_ok = all(v != "unavailable" for v in checks.values())
    return {
        "status": "ready" if all_ok else "degraded",
        "checks": checks,
        "python": sys.version,
        "platform": platform.platform(),
    }
