"""MediaPipe Pose estimation service (ADR-004: Phase 3 先行実装).

Phase 3: MediaPipe 2D keypoints → 128-dim kinematics_vector
Phase 4+: SMPLify-X 3D mesh upgrade (pending commercial license review)
"""
from __future__ import annotations

import contextlib
import math
from pathlib import Path
from typing import Generator, Optional

import cv2
import mediapipe as mp
import numpy as np

from app.core.config import settings
from app.core.logging import get_logger
from app.models.cv_job import (
    CVErrorMetric,
    FrameKeypoints,
    KinematicsVector,
    Landmark,
    RejectionReason,
)

logger = get_logger(__name__)

# MediaPipe landmark indices (33 keypoints)
class PoseLandmark:
    NOSE = 0
    LEFT_SHOULDER = 11; RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13;    RIGHT_ELBOW = 14
    LEFT_WRIST = 15;    RIGHT_WRIST = 16
    LEFT_HIP = 23;      RIGHT_HIP = 24
    LEFT_KNEE = 25;     RIGHT_KNEE = 26
    LEFT_ANKLE = 27;    RIGHT_ANKLE = 28
    LEFT_HEEL = 29;     RIGHT_HEEL = 30
    LEFT_FOOT_INDEX = 31; RIGHT_FOOT_INDEX = 32


@contextlib.contextmanager
def _open_video(video_path: Path) -> Generator[cv2.VideoCapture, None, None]:
    cap = cv2.VideoCapture(str(video_path))
    try:
        if not cap.isOpened():
            raise ValueError(f"Cannot open video: {video_path}")
        yield cap
    finally:
        cap.release()


def _angle_3pts(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """Compute angle at vertex b formed by segments a-b-c (degrees)."""
    ba = a - b
    bc = c - b
    cos_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-9)
    return float(math.degrees(math.acos(np.clip(cos_angle, -1.0, 1.0))))


class PoseEstimatorService:
    """Stateful MediaPipe pose estimator.
    
    Usage:
        with PoseEstimatorService() as svc:
            keypoints, vector, errors, rejection = svc.analyze(video_path)
    """

    def __init__(self) -> None:
        self._mp_pose = mp.solutions.pose
        self._pose: Optional[mp.solutions.pose.Pose] = None

    def __enter__(self) -> "PoseEstimatorService":
        self._pose = self._mp_pose.Pose(
            static_image_mode=False,
            model_complexity=settings.pose_model_complexity,
            smooth_landmarks=True,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        logger.info("mediapipe_pose_initialized",
                    model_complexity=settings.pose_model_complexity)
        return self

    def __exit__(self, *_) -> None:
        if self._pose:
            self._pose.close()
            self._pose = None

    # ── Public API ──────────────────────────────────────────────────────

    def analyze(
        self,
        video_path: Path,
    ) -> tuple[
        list[FrameKeypoints],
        Optional[KinematicsVector],
        Optional[list[CVErrorMetric]],
        Optional[RejectionReason],
    ]:
        """Run full pose analysis on a video file.
        
        Returns:
            (frame_keypoints, kinematics_vector, cv_errors, rejection_reason)
            rejection_reason is set when video cannot be processed.
        """
        assert self._pose is not None, "Use as context manager"

        with _open_video(video_path) as cap:
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration_sec = total_frames / fps

            # ── Gate: video length check ──────────────────────────
            if duration_sec < 3.0:
                logger.warning("video_too_short", duration_sec=duration_sec)
                return [], None, None, RejectionReason.ERR_TOO_SHORT
            if duration_sec > settings.max_video_duration_sec:
                logger.warning("video_too_long", duration_sec=duration_sec)
                return [], None, None, RejectionReason.ERR_TOO_LONG

            # ── Frame sampling: analyze every Nth frame ─────────
            # Target ~60 analysis frames regardless of video length
            sample_interval = max(1, total_frames // 60)

            frame_idx = 0
            sampled_keypoints: list[FrameKeypoints] = []
            pose_detected_count = 0

            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % sample_interval == 0:
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    results = self._pose.process(rgb)

                    if results.pose_landmarks:
                        landmarks = [
                            Landmark(
                                x=lm.x, y=lm.y, z=lm.z,
                                visibility=lm.visibility,
                            )
                            for lm in results.pose_landmarks.landmark
                        ]
                        pose_detected = True
                        pose_detected_count += 1
                    else:
                        landmarks = []
                        pose_detected = False

                    sampled_keypoints.append(FrameKeypoints(
                        frame_index=frame_idx,
                        timestamp_ms=(frame_idx / fps) * 1000,
                        landmarks=landmarks,
                        pose_detected=pose_detected,
                    ))

                frame_idx += 1

        # ── Gate: minimum detection rate ─────────────────────────
        if sampled_keypoints:
            detection_rate = pose_detected_count / len(sampled_keypoints)
        else:
            detection_rate = 0.0

        if detection_rate < 0.5:
            logger.warning("no_person_detected", detection_rate=detection_rate)
            return sampled_keypoints, None, None, RejectionReason.ERR_NO_PERSON

        # ── Build kinematics vector ───────────────────────────────
        kinematics = self._compute_kinematics_vector(
            sampled_keypoints, fps, duration_sec
        )

        # ── Detect biomechanical errors ──────────────────────────
        cv_errors = self._detect_errors(sampled_keypoints, kinematics)

        logger.info(
            "pose_analysis_complete",
            total_frames=total_frames,
            sampled_frames=len(sampled_keypoints),
            detection_rate=round(detection_rate, 3),
            duration_sec=round(duration_sec, 1),
        )
        return sampled_keypoints, kinematics, cv_errors, None

    # ── Private: kinematics computation ────────────────────────────────

    def _compute_kinematics_vector(
        self,
        frames: list[FrameKeypoints],
        fps: float,
        duration_sec: float,
    ) -> KinematicsVector:
        """Compute 128-dim feature vector from pose keypoints.
        
        Dims 0–63:  joint angles (mean/std per joint)
        Dims 64–95: angular velocities (mean/std per joint)
        Dims 96–127: symmetry & timing features
        """
        detected_frames = [f for f in frames if f.pose_detected and f.landmarks]

        # --- Joint angle sequences ---
        joint_angle_seqs: dict[str, list[float]] = {
            "l_knee": [], "r_knee": [],
            "l_hip": [], "r_hip": [],
            "l_elbow": [], "r_elbow": [],
            "l_shoulder": [], "r_shoulder": [],
            "trunk_lean": [], "pelvic_tilt": [],
            "l_ankle": [], "r_ankle": [],
            "head_tilt": [], "l_wrist": [],
            "r_wrist": [], "step_width": [],
        }

        for frame in detected_frames:
            lm = frame.landmarks
            if len(lm) < 33:
                continue

            def pt(idx: int) -> np.ndarray:
                return np.array([lm[idx].x, lm[idx].y, lm[idx].z])

            # Knee angles
            joint_angle_seqs["l_knee"].append(_angle_3pts(
                pt(PoseLandmark.LEFT_HIP), pt(PoseLandmark.LEFT_KNEE), pt(PoseLandmark.LEFT_ANKLE)
            ))
            joint_angle_seqs["r_knee"].append(_angle_3pts(
                pt(PoseLandmark.RIGHT_HIP), pt(PoseLandmark.RIGHT_KNEE), pt(PoseLandmark.RIGHT_ANKLE)
            ))
            # Hip angles (using vertical reference)
            joint_angle_seqs["l_hip"].append(_angle_3pts(
                pt(PoseLandmark.LEFT_SHOULDER), pt(PoseLandmark.LEFT_HIP), pt(PoseLandmark.LEFT_KNEE)
            ))
            joint_angle_seqs["r_hip"].append(_angle_3pts(
                pt(PoseLandmark.RIGHT_SHOULDER), pt(PoseLandmark.RIGHT_HIP), pt(PoseLandmark.RIGHT_KNEE)
            ))
            # Elbow angles
            joint_angle_seqs["l_elbow"].append(_angle_3pts(
                pt(PoseLandmark.LEFT_SHOULDER), pt(PoseLandmark.LEFT_ELBOW), pt(PoseLandmark.LEFT_WRIST)
            ))
            joint_angle_seqs["r_elbow"].append(_angle_3pts(
                pt(PoseLandmark.RIGHT_SHOULDER), pt(PoseLandmark.RIGHT_ELBOW), pt(PoseLandmark.RIGHT_WRIST)
            ))
            # Trunk lean (angle of spine from vertical)
            mid_shoulder = (pt(PoseLandmark.LEFT_SHOULDER) + pt(PoseLandmark.RIGHT_SHOULDER)) / 2
            mid_hip = (pt(PoseLandmark.LEFT_HIP) + pt(PoseLandmark.RIGHT_HIP)) / 2
            vertical = np.array([0, -1, 0])
            spine = mid_shoulder - mid_hip
            cos_trunk = np.dot(spine, vertical) / (np.linalg.norm(spine) + 1e-9)
            joint_angle_seqs["trunk_lean"].append(
                float(math.degrees(math.acos(np.clip(cos_trunk, -1.0, 1.0))))
            )
            # Step width (lateral distance between ankles)
            l_ankle = pt(PoseLandmark.LEFT_ANKLE)
            r_ankle = pt(PoseLandmark.RIGHT_ANKLE)
            joint_angle_seqs["step_width"].append(float(abs(l_ankle[0] - r_ankle[0])))

        # --- Build 128-dim vector ---
        vector: list[float] = []
        joints = list(joint_angle_seqs.keys())

        # Dims 0–31: mean per joint (16 joints × 2 stats per block)
        # Dims 0–15: mean angles
        # Dims 16–31: std angles
        for joint in joints:
            seq = joint_angle_seqs[joint]
            arr = np.array(seq) if seq else np.array([0.0])
            vector.append(float(np.mean(arr)))
        for joint in joints:
            seq = joint_angle_seqs[joint]
            arr = np.array(seq) if seq else np.array([0.0])
            vector.append(float(np.std(arr)))

        # Dims 32–63: min/max per joint
        for joint in joints:
            seq = joint_angle_seqs[joint]
            arr = np.array(seq) if seq else np.array([0.0])
            vector.append(float(np.min(arr)))
        for joint in joints:
            seq = joint_angle_seqs[joint]
            arr = np.array(seq) if seq else np.array([0.0])
            vector.append(float(np.max(arr)))

        # Dims 64–95: angular velocity (mean/std of frame-to-frame delta)
        for joint in joints:
            seq = joint_angle_seqs[joint]
            if len(seq) >= 2:
                deltas = np.diff(seq)
                vector.append(float(np.mean(np.abs(deltas))))
                vector.append(float(np.std(deltas)))
            else:
                vector.extend([0.0, 0.0])

        # Dims 96–127: symmetry & temporal features
        # Symmetry ratios (L/R pairs)
        symmetry_pairs = [
            ("l_knee", "r_knee"), ("l_hip", "r_hip"),
            ("l_elbow", "r_elbow"), ("l_shoulder", "r_shoulder"),
            ("l_ankle", "r_ankle"),
        ]
        for l_joint, r_joint in symmetry_pairs:
            l_mean = np.mean(joint_angle_seqs[l_joint]) if joint_angle_seqs[l_joint] else 0.0
            r_mean = np.mean(joint_angle_seqs[r_joint]) if joint_angle_seqs[r_joint] else 0.0
            ratio = l_mean / (r_mean + 1e-9)
            vector.append(float(ratio))
            asymmetry = abs(l_mean - r_mean)
            vector.append(float(asymmetry))

        # Temporal features
        vector.append(float(duration_sec))
        vector.append(float(fps))
        vector.append(float(len(detected_frames)))
        vector.append(float(len(detected_frames) / max(len(frames), 1)))

        # Pad/truncate to exactly 128 dims
        while len(vector) < 128:
            vector.append(0.0)
        vector = vector[:128]

        confidence = len(detected_frames) / max(len(frames), 1)

        return KinematicsVector(
            vector=vector,
            frame_count=len(detected_frames),
            confidence_score=round(confidence, 4),
        )

    def _detect_errors(
        self,
        frames: list[FrameKeypoints],
        kinematics: KinematicsVector,
    ) -> list[CVErrorMetric]:
        """Detect biomechanical error patterns from kinematics vector.
        
        Returns top-5 errors sorted by severity (for LLM context injection).
        """
        errors: list[CVErrorMetric] = []
        v = kinematics.vector

        # ── Rule 1: Excessive trunk lean ─────────────────────────
        trunk_mean = v[12]   # index 12 = "trunk_lean" mean
        if trunk_mean > 15.0:
            severity = min(1.0, (trunk_mean - 15.0) / 20.0)
            errors.append(CVErrorMetric(
                error_type="trunk_lean_excess",
                severity=round(severity, 3),
                affected_frames=kinematics.frame_count,
                description=f"前傾角度が平均 {trunk_mean:.1f}° (基準: <15°)",
                recommendation="体幹筋群の強化と骨盤前傾の修正プログラムを推奨",
            ))

        # ── Rule 2: Knee asymmetry ───────────────────────────────
        l_knee_mean = v[0]   # "l_knee" mean
        r_knee_mean = v[1]   # "r_knee" mean
        knee_asymmetry = abs(l_knee_mean - r_knee_mean)
        if knee_asymmetry > 10.0:
            severity = min(1.0, knee_asymmetry / 30.0)
            errors.append(CVErrorMetric(
                error_type="knee_asymmetry",
                severity=round(severity, 3),
                affected_frames=kinematics.frame_count,
                description=f"左右膝関節角度差 {knee_asymmetry:.1f}° (基準: <10°)",
                recommendation="単脚スクワット評価と片側機能訓練を検討",
            ))

        # ── Rule 3: High angular velocity variance (jerky motion) ──
        r_knee_vel_std = v[65] if len(v) > 65 else 0.0
        if r_knee_vel_std > 8.0:
            severity = min(1.0, r_knee_vel_std / 20.0)
            errors.append(CVErrorMetric(
                error_type="motion_jerkiness",
                severity=round(severity, 3),
                affected_frames=kinematics.frame_count,
                description=f"膝関節角速度変動が大きい (σ={r_knee_vel_std:.1f}°/frame)",
                recommendation="コントロールドエキセントリック訓練で動作スムーズ化",
            ))

        # ── Rule 4: Hip drop (pelvis tilt asymmetry) ────────────
        l_hip_mean = v[2]    # "l_hip" mean
        r_hip_mean = v[3]    # "r_hip" mean
        hip_asymmetry = abs(l_hip_mean - r_hip_mean)
        if hip_asymmetry > 8.0:
            severity = min(1.0, hip_asymmetry / 25.0)
            errors.append(CVErrorMetric(
                error_type="hip_drop",
                severity=round(severity, 3),
                affected_frames=kinematics.frame_count,
                description=f"骨盤側方傾斜差 {hip_asymmetry:.1f}° (基準: <8°)",
                recommendation="中殿筋・TFLの強化、Side-lying hip abductionを推奨",
            ))

        # ── Rule 5: Restricted elbow swing ──────────────────────
        l_elbow_mean = v[4]
        r_elbow_mean = v[5]
        elbow_range = (l_elbow_mean + r_elbow_mean) / 2
        if elbow_range < 70.0:
            severity = min(1.0, (70.0 - elbow_range) / 40.0)
            errors.append(CVErrorMetric(
                error_type="restricted_arm_swing",
                severity=round(severity, 3),
                affected_frames=kinematics.frame_count,
                description=f"肘関節平均可動域 {elbow_range:.1f}° (基準: >70°)",
                recommendation="肩甲骨モビリティ改善と腕振りドリルを推奨",
            ))

        # Sort by severity descending, return top 5
        errors.sort(key=lambda e: e.severity, reverse=True)
        return errors[:5]
