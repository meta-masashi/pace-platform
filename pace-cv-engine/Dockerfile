# ============================================================
# PACE CV Engine — CUDA 12.x + Python 3.11 base image
# Phase 3 Sprint 1 / ADR-013
# ============================================================
FROM nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04

# ---------- System deps ----------
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-dev \
    python3-pip \
    python3.11-venv \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Alias python3.11 → python / python3
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 \
    && python -m pip install --upgrade pip setuptools wheel

# ---------- Working dir ----------
WORKDIR /app

# ---------- Python dependencies ----------
COPY pyproject.toml ./
RUN pip install -e ".[dev]" --no-deps 2>/dev/null; \
    pip install \
    fastapi==0.111.0 \
    "uvicorn[standard]==0.30.1" \
    mediapipe==0.10.14 \
    opencv-python-headless==4.10.0.84 \
    numpy==1.26.4 \
    boto3==1.34.144 \
    "aiobotocore==2.13.1" \
    "pydantic==2.7.4" \
    "pydantic-settings==2.3.4" \
    httpx==0.27.0 \
    python-multipart==0.0.9 \
    structlog==24.2.0 \
    "sentry-sdk[fastapi]==2.7.1" \
    pgmpy==0.1.26 \
    networkx==3.3 \
    pandas==2.2.2 \
    scikit-learn==1.5.1

# ---------- Application code ----------
COPY app/ ./app/
COPY scripts/ ./scripts/

# ---------- GPU health check script ----------
COPY scripts/gpu_verify.py ./gpu_verify.py

# ---------- Non-root user ----------
RUN groupadd -r cvengine && useradd -r -g cvengine cvengine \
    && chown -R cvengine:cvengine /app
USER cvengine

# ---------- Expose & run ----------
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
