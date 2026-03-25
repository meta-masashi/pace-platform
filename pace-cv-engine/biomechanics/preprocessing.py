"""
キネマティクスデータの前処理モジュール
- 3Dモーションキャプチャデータのパース
- Butterworthローパスフィルタによるノイズ除去
- 動作フェーズの抽出（フットストライク、着地等）
"""

from __future__ import annotations

import numpy as np
from scipy.signal import butter, filtfilt

# ---------- 標準関節名 ----------
JOINT_NAMES: list[str] = [
    'hip_l', 'hip_r',
    'knee_l', 'knee_r',
    'ankle_l', 'ankle_r',
    'shoulder_l', 'shoulder_r',
    'elbow_l', 'elbow_r',
    'wrist_l', 'wrist_r',
    'pelvis_center',
    'com',
]


def butterworth_lowpass(
    data: np.ndarray,
    cutoff: float = 12.0,
    fs: float = 200.0,
    order: int = 4,
) -> np.ndarray:
    """
    Butterworthローパスフィルタ
    スポーツバイオメカニクス標準: カットオフ12Hz, サンプリング200Hz, 4次
    Winter DA (2009) Biomechanics and Motor Control of Human Movement
    """
    nyq = 0.5 * fs
    normal_cutoff = cutoff / nyq
    b, a = butter(order, normal_cutoff, btype='low', analog=False)
    return filtfilt(b, a, data, axis=0)


def parse_biomech_data(
    filepath: str | None = None,
    raw_data: np.ndarray | None = None,
    fs: float = 200.0,
) -> dict:
    """
    モーションキャプチャデータをパースし、関節座標辞書を返す

    対応フォーマット:
    - raw numpy array (N_frames x N_joints x 3)
    - filepath: CSV (OpenBiomechanics / SPL-open-data)

    Returns: {
        'hip_l': np.ndarray (N, 3),  ...  'com': np.ndarray (N, 3),
        'fs': float,  'n_frames': int,
    }
    """
    if raw_data is not None:
        # raw_data: (N, J, 3) — J >= 14 (JOINT_NAMES の数)
        if raw_data.ndim == 3:
            n_frames = raw_data.shape[0]
            joints: dict = {}
            for idx, name in enumerate(JOINT_NAMES):
                if idx < raw_data.shape[1]:
                    joints[name] = butterworth_lowpass(raw_data[:, idx, :], fs=fs)
            joints['fs'] = fs
            joints['n_frames'] = n_frames
            return joints
        raise ValueError("raw_data は (N_frames, N_joints, 3) の形式である必要があります")

    if filepath is not None:
        return _parse_csv(filepath, fs)

    raise ValueError("filepath または raw_data のいずれかを指定してください")


def _parse_csv(filepath: str, fs: float) -> dict:
    """
    CSV形式のモーションキャプチャデータをパース

    対応カラム命名規則:
    - OpenBiomechanics: 'hip_l_x', 'hip_l_y', 'hip_l_z' ...
    - SPL-open-data: 'LHIP_X', 'LHIP_Y', 'LHIP_Z' ...
    """
    import pandas as pd

    df = pd.read_csv(filepath)
    n_frames = len(df)
    joints: dict = {}

    # SPL命名マッピング
    spl_map: dict[str, str] = {
        'LHIP': 'hip_l', 'RHIP': 'hip_r',
        'LKNEE': 'knee_l', 'RKNEE': 'knee_r',
        'LANKLE': 'ankle_l', 'RANKLE': 'ankle_r',
        'LSHOULDER': 'shoulder_l', 'RSHOULDER': 'shoulder_r',
        'LELBOW': 'elbow_l', 'RELBOW': 'elbow_r',
        'LWRIST': 'wrist_l', 'RWRIST': 'wrist_r',
        'PELVIS': 'pelvis_center',
        'COM': 'com',
    }

    columns_lower = {c.lower(): c for c in df.columns}

    for joint_name in JOINT_NAMES:
        coords: np.ndarray | None = None

        # OpenBiomechanics 形式: joint_x, joint_y, joint_z
        x_col = columns_lower.get(f"{joint_name}_x")
        y_col = columns_lower.get(f"{joint_name}_y")
        z_col = columns_lower.get(f"{joint_name}_z")
        if x_col and y_col and z_col:
            coords = df[[x_col, y_col, z_col]].values.astype(np.float64)

        # SPL形式: LJOINT_X, LJOINT_Y, LJOINT_Z
        if coords is None:
            for spl_prefix, mapped_name in spl_map.items():
                if mapped_name == joint_name:
                    sx = columns_lower.get(f"{spl_prefix.lower()}_x")
                    sy = columns_lower.get(f"{spl_prefix.lower()}_y")
                    sz = columns_lower.get(f"{spl_prefix.lower()}_z")
                    if sx and sy and sz:
                        coords = df[[sx, sy, sz]].values.astype(np.float64)
                    break

        if coords is not None:
            joints[joint_name] = butterworth_lowpass(coords, fs=fs)
        else:
            # 欠損関節はゼロ埋め
            joints[joint_name] = np.zeros((n_frames, 3), dtype=np.float64)

    joints['fs'] = fs
    joints['n_frames'] = n_frames
    return joints


def extract_phase(joints: dict, phase: str = 'landing') -> dict:
    """
    動作フェーズの抽出
    - 'landing': 着地の瞬間（垂直方向の加速度ピーク検出）
    - 'foot_strike': フットストライク（投球動作）
    - 'full': 全フレーム

    Returns: phase-specific subset of joints dict
    """
    if phase == 'full':
        return joints

    n_frames: int = joints['n_frames']
    fs: float = joints['fs']

    if phase == 'landing':
        # 着地検出: COM の垂直方向（Z）加速度のピーク
        com = joints.get('com', np.zeros((n_frames, 3)))
        vz = np.diff(com[:, 2]) * fs  # 垂直速度
        az = np.diff(vz) * fs          # 垂直加速度
        if len(az) > 0:
            peak_idx = int(np.argmax(np.abs(az)))
            # ピーク前後 ±50ms のウィンドウ
            window = int(0.05 * fs)
            start = max(0, peak_idx - window)
            end = min(n_frames, peak_idx + window)
        else:
            start, end = 0, n_frames
    elif phase == 'foot_strike':
        # フットストライク検出: 足首の垂直位置が最低点に達する瞬間
        ankle = joints.get('ankle_r', np.zeros((n_frames, 3)))
        if np.any(ankle):
            min_idx = int(np.argmin(ankle[:, 2]))
            window = int(0.1 * fs)
            start = max(0, min_idx - window)
            end = min(n_frames, min_idx + window)
        else:
            start, end = 0, n_frames
    else:
        start, end = 0, n_frames

    # フェーズ部分を切り出し
    phase_joints: dict = {}
    for key, value in joints.items():
        if isinstance(value, np.ndarray) and value.ndim >= 1 and value.shape[0] == n_frames:
            phase_joints[key] = value[start:end]
        else:
            phase_joints[key] = value
    phase_joints['n_frames'] = end - start
    phase_joints['fs'] = fs
    return phase_joints


def generate_synthetic_mocap(
    n_frames: int = 500,
    fs: float = 200.0,
    add_noise: bool = True,
    knee_valgus_deg: float = 0.0,
    movement_type: str = 'squat',
) -> dict:
    """
    テスト用合成モーションキャプチャデータの生成

    - movement_type='squat': スクワット動作（膝屈曲→伸展）
    - movement_type='landing': ジャンプ着地
    - knee_valgus_deg: 膝外反（ニーイン）の度数を追加（構造的脆弱性テスト用）
    - add_noise: ガウシアンノイズ追加（フィルタテスト用）

    Generates realistic joint trajectories with:
    - Hip at ~0.9m height
    - Knee at ~0.5m
    - Ankle at ground level
    - Sinusoidal flexion-extension pattern
    - Optional knee valgus (medial collapse)
    """
    t = np.linspace(0, n_frames / fs, n_frames)

    # 基本動作パターン（屈曲-伸展サイクル）
    if movement_type == 'squat':
        # 2サイクルのスクワット
        flexion = 0.15 * np.sin(2 * np.pi * 0.5 * t)
    elif movement_type == 'landing':
        # ジャンプ着地: 急激な屈曲→緩やかな伸展
        flexion = 0.2 * np.exp(-3.0 * t) * np.sin(2 * np.pi * 2.0 * t)
    else:
        flexion = 0.15 * np.sin(2 * np.pi * 0.5 * t)

    # 膝外反の内側偏位量（メートル）
    valgus_offset = np.tan(np.radians(knee_valgus_deg)) * 0.4  # 大腿長0.4m想定

    joints: dict = {}

    # ----- 骨盤 / COM -----
    pelvis_height = 0.9 + flexion * 0.5
    joints['pelvis_center'] = np.column_stack([
        np.zeros(n_frames),
        np.zeros(n_frames),
        pelvis_height,
    ])
    joints['com'] = joints['pelvis_center'] * 0.95  # COM ≈ 骨盤直下

    # ----- 股関節（骨盤左右） -----
    # 解剖学的構造: 股関節は膝・足首より外側に位置
    # この幅の差がQアングル（~15°）を生成する
    hip_width = 0.18  # 股関節は広い
    knee_width = 0.10  # 膝は股関節より内側
    ankle_width = 0.10  # 足首も内側

    joints['hip_l'] = np.column_stack([
        np.full(n_frames, -hip_width),
        np.zeros(n_frames),
        pelvis_height,
    ])
    joints['hip_r'] = np.column_stack([
        np.full(n_frames, hip_width),
        np.zeros(n_frames),
        pelvis_height,
    ])

    # ----- 膝 -----
    knee_height = 0.5 + flexion * 0.3
    joints['knee_l'] = np.column_stack([
        np.full(n_frames, -knee_width + valgus_offset),  # 外反 → 内側偏位
        np.zeros(n_frames),
        knee_height,
    ])
    joints['knee_r'] = np.column_stack([
        np.full(n_frames, knee_width - valgus_offset),   # 外反 → 内側偏位
        np.zeros(n_frames),
        knee_height,
    ])

    # ----- 足首 -----
    joints['ankle_l'] = np.column_stack([
        np.full(n_frames, -ankle_width),
        np.zeros(n_frames),
        np.full(n_frames, 0.05),
    ])
    joints['ankle_r'] = np.column_stack([
        np.full(n_frames, ankle_width),
        np.zeros(n_frames),
        np.full(n_frames, 0.05),
    ])

    # ----- 肩（体幹前傾 ~20° を反映） -----
    shoulder_width = 0.2
    trunk_length = 0.45
    # 体幹前傾: Y方向に前傾を加える（~20° → sin(20°)*0.45 ≈ 0.154m 前方）
    trunk_lean_rad = np.radians(20.0)
    forward_offset = trunk_length * np.sin(trunk_lean_rad)
    vertical_offset = trunk_length * np.cos(trunk_lean_rad)
    shoulder_height = pelvis_height + vertical_offset
    joints['shoulder_l'] = np.column_stack([
        np.full(n_frames, -shoulder_width),
        np.full(n_frames, forward_offset),
        shoulder_height,
    ])
    joints['shoulder_r'] = np.column_stack([
        np.full(n_frames, shoulder_width),
        np.full(n_frames, forward_offset),
        shoulder_height,
    ])

    # ----- 肘（肩とほぼ同じ高さ — 投球準備姿勢を想定） -----
    elbow_height = shoulder_height - 0.02  # 肩のわずか下
    joints['elbow_l'] = np.column_stack([
        np.full(n_frames, -shoulder_width - 0.25),
        np.zeros(n_frames),
        elbow_height,
    ])
    joints['elbow_r'] = np.column_stack([
        np.full(n_frames, shoulder_width + 0.25),
        np.zeros(n_frames),
        elbow_height,
    ])

    # ----- 手首 -----
    wrist_height = elbow_height - 0.25
    joints['wrist_l'] = np.column_stack([
        np.full(n_frames, -shoulder_width - 0.30),
        np.zeros(n_frames),
        wrist_height,
    ])
    joints['wrist_r'] = np.column_stack([
        np.full(n_frames, shoulder_width + 0.30),
        np.zeros(n_frames),
        wrist_height,
    ])

    # ガウシアンノイズ追加
    if add_noise:
        for name in JOINT_NAMES:
            if name in joints:
                joints[name] = joints[name] + np.random.normal(0, 0.002, joints[name].shape)

    joints['fs'] = fs
    joints['n_frames'] = n_frames
    return joints
