"""Face masking service using MediaPipe Face Detection + OpenCV blur (ADR-008).

Requirement: ≥99% face detection and masking rate.
All raw videos are masked before storing to S3 masked_bucket.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class FaceMaskerService:
    """Apply Gaussian blur over detected faces in video.
    
    Usage:
        with FaceMaskerService() as masker:
            output_path, stats = masker.mask_video(input_path, output_path)
    """

    def __init__(self) -> None:
        self._mp_face = mp.solutions.face_detection
        self._face_detector: mp.solutions.face_detection.FaceDetection | None = None

    def __enter__(self) -> "FaceMaskerService":
        self._face_detector = self._mp_face.FaceDetection(
            model_selection=1,          # 1 = full-range model (up to 5m)
            min_detection_confidence=0.3,  # Low threshold → higher recall
        )
        logger.info("face_masker_initialized", model_selection=1)
        return self

    def __exit__(self, *_) -> None:
        if self._face_detector:
            self._face_detector.close()
            self._face_detector = None

    def mask_video(
        self,
        input_path: Path,
        output_path: Path,
    ) -> dict:
        """Apply face masking to video and write to output_path.
        
        Returns stats dict with masking metrics.
        """
        assert self._face_detector is not None, "Use as context manager"

        cap = cv2.VideoCapture(str(input_path))
        if not cap.isOpened():
            raise ValueError(f"Cannot open video: {input_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Use MP4V codec for broad compatibility
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

        kernel = settings.face_blur_kernel
        # Ensure kernel is odd
        if kernel % 2 == 0:
            kernel += 1

        frames_processed = 0
        frames_with_faces = 0
        total_faces_masked = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = self._face_detector.process(rgb)

                if results.detections:
                    frames_with_faces += 1
                    for detection in results.detections:
                        frame = self._blur_face(frame, detection, width, height, kernel)
                        total_faces_masked += 1

                writer.write(frame)
                frames_processed += 1

        finally:
            cap.release()
            writer.release()

        masking_rate = frames_with_faces / max(frames_processed, 1)
        stats = {
            "frames_processed": frames_processed,
            "frames_with_faces": frames_with_faces,
            "total_faces_masked": total_faces_masked,
            "masking_rate": round(masking_rate, 4),
            "output_path": str(output_path),
            "blur_kernel": kernel,
        }

        logger.info(
            "face_masking_complete",
            **{k: v for k, v in stats.items() if k != "output_path"},
        )

        return stats

    def _blur_face(
        self,
        frame: np.ndarray,
        detection,
        width: int,
        height: int,
        kernel: int,
    ) -> np.ndarray:
        """Apply Gaussian blur to face bounding box region with padding."""
        bbox = detection.location_data.relative_bounding_box

        # Convert relative coords to pixel coords
        x = max(0, int(bbox.xmin * width))
        y = max(0, int(bbox.ymin * height))
        w = min(width - x, int(bbox.width * width))
        h = min(height - y, int(bbox.height * height))

        # Add 20% padding for hairline/ears
        pad_x = int(w * 0.20)
        pad_y = int(h * 0.20)
        x1 = max(0, x - pad_x)
        y1 = max(0, y - pad_y)
        x2 = min(width, x + w + pad_x)
        y2 = min(height, y + h + pad_y)

        if x2 > x1 and y2 > y1:
            roi = frame[y1:y2, x1:x2]
            blurred = cv2.GaussianBlur(roi, (kernel, kernel), 0)
            frame[y1:y2, x1:x2] = blurred

        return frame
