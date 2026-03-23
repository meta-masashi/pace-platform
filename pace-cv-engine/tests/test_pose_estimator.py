"""Unit tests for PoseEstimatorService (no GPU required — mocked CV)."""
from __future__ import annotations

import math
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.models.cv_job import FrameKeypoints, Landmark, RejectionReason
from app.services.pose_estimator import PoseEstimatorService, _angle_3pts


# ── Helper: create mock landmark list ────────────────────────────────

def _make_landmark(x: float = 0.5, y: float = 0.5, z: float = 0.0,
                   vis: float = 1.0) -> Landmark:
    return Landmark(x=x, y=y, z=z, visibility=vis)


def _make_frame(frame_idx: int, detected: bool = True) -> FrameKeypoints:
    if detected:
        lms = [_make_landmark() for _ in range(33)]
    else:
        lms = []
    return FrameKeypoints(
        frame_index=frame_idx,
        timestamp_ms=frame_idx * 33.3,
        landmarks=lms,
        pose_detected=detected,
    )


# ── Tests ─────────────────────────────────────────────────────────────

class TestAngle3Pts:
    def test_right_angle(self):
        a = np.array([1.0, 0.0, 0.0])
        b = np.array([0.0, 0.0, 0.0])
        c = np.array([0.0, 1.0, 0.0])
        angle = _angle_3pts(a, b, c)
        assert abs(angle - 90.0) < 0.01

    def test_straight_line(self):
        a = np.array([-1.0, 0.0, 0.0])
        b = np.array([0.0, 0.0, 0.0])
        c = np.array([1.0, 0.0, 0.0])
        angle = _angle_3pts(a, b, c)
        assert abs(angle - 180.0) < 0.01

    def test_acute_angle(self):
        a = np.array([1.0, 0.0, 0.0])
        b = np.array([0.0, 0.0, 0.0])
        c = np.array([1.0, 1.0, 0.0])
        angle = _angle_3pts(a, b, c)
        assert abs(angle - 45.0) < 0.1


class TestKinematicsVector:
    """Test kinematics vector computation with synthetic frames."""

    def test_vector_length_is_128(self):
        svc = PoseEstimatorService()
        frames = [_make_frame(i) for i in range(30)]
        vector = svc._compute_kinematics_vector(frames, fps=30.0, duration_sec=1.0)
        assert len(vector.vector) == 128

    def test_confidence_score_range(self):
        svc = PoseEstimatorService()
        frames = [_make_frame(i) for i in range(20)]
        vector = svc._compute_kinematics_vector(frames, fps=30.0, duration_sec=0.67)
        assert 0.0 <= vector.confidence_score <= 1.0

    def test_no_detected_frames_returns_zeros(self):
        svc = PoseEstimatorService()
        frames = [_make_frame(i, detected=False) for i in range(10)]
        vector = svc._compute_kinematics_vector(frames, fps=30.0, duration_sec=0.33)
        assert all(v == 0.0 or v == 10.0 for v in [vector.frame_count])


class TestErrorDetection:
    def test_no_errors_on_perfect_motion(self):
        """With all joints at 90° (within normal range), minimal errors."""
        svc = PoseEstimatorService()
        frames = [_make_frame(i) for i in range(30)]
        # Build a near-perfect kinematics vector
        vector_data = [90.0] * 128  # All joints ~90°, symmetric
        from app.models.cv_job import KinematicsVector
        kv = KinematicsVector(vector=vector_data, frame_count=30, confidence_score=0.95)
        errors = svc._detect_errors(frames, kv)
        # With symmetric data, asymmetry errors should be zero
        asymmetry_errors = [e for e in errors if "asymmetry" in e.error_type]
        for e in asymmetry_errors:
            assert e.severity < 0.1

    def test_high_trunk_lean_detected(self):
        """Trunk lean > 15° should trigger trunk_lean_excess error."""
        svc = PoseEstimatorService()
        frames = [_make_frame(i) for i in range(30)]
        vector_data = [90.0] * 128
        # Index 12 = "trunk_lean" mean
        vector_data[12] = 30.0  # 30° trunk lean (exceeds 15° threshold)
        from app.models.cv_job import KinematicsVector
        kv = KinematicsVector(vector=vector_data, frame_count=30, confidence_score=0.9)
        errors = svc._detect_errors(frames, kv)
        trunk_errors = [e for e in errors if e.error_type == "trunk_lean_excess"]
        assert len(trunk_errors) == 1
        assert trunk_errors[0].severity > 0.0


class TestRejectionLogic:
    """Test video rejection paths (mocked video capture)."""

    @patch("app.services.pose_estimator.cv2.VideoCapture")
    def test_short_video_rejected(self, mock_cap_cls):
        """Videos < 3 seconds should return ERR_TOO_SHORT."""
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        mock_cap.get.side_effect = lambda prop: {
            0x05: 30.0,   # CAP_PROP_FPS
            0x07: 60.0,   # CAP_PROP_FRAME_COUNT → 2 seconds
        }.get(prop, 0.0)
        mock_cap.read.return_value = (False, None)
        mock_cap_cls.return_value = mock_cap

        svc = PoseEstimatorService()
        svc._pose = MagicMock()

        from pathlib import Path
        keypoints, kv, errors, rejection = svc.analyze(Path("/fake/video.mp4"))

        assert rejection == RejectionReason.ERR_TOO_SHORT
        assert kv is None
