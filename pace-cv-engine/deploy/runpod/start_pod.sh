#!/usr/bin/env bash
# RunPod pod startup script — runs inside container
# Verifies GPU, then starts worker or API based on MODE env var

set -e

echo "=== PACE CV Engine Pod Starting ==="
echo "Mode: ${POD_MODE:-worker}"
echo "Environment: ${ENVIRONMENT:-development}"

# GPU verification
python gpu_verify.py

if [ "${POD_MODE:-worker}" = "api" ]; then
    echo "Starting API server..."
    exec uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers 1
else
    echo "Starting SQS worker..."
    exec python -m app.worker
fi
