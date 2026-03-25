"""
ニューロモーター・ノイズ（η_NM）計算モジュール

靭帯損傷後の固有受容器不全（Proprioceptive Deficit）を
動作の非線形時系列解析（サンプルエントロピー）で検出する。

数式:
η_NM = (1 / (1 + exp(-β × (SampEn_IMU - μ_baseline)))) × (1 + α × History_Node0)
Effective_Acute = Acute_raw × (1 + η_NM)

参考: Richman JS, Moorman JR. Am J Physiol Heart Circ Physiol. 2000;278(6):H2039-H2049
"""

from __future__ import annotations

import numpy as np


def compute_sample_entropy(
    signal: np.ndarray,
    m: int = 2,
    r: float = 0.2,
) -> float:
    """
    サンプルエントロピー（SampEn）の計算

    動作の「規則性」を定量化する非線形指標。
    - 低い値 = 規則的な動作（健常な神経制御）
    - 高い値 = 不規則な動作（固有受容器の不全、疲労、神経系のバグ）

    Args:
        signal: 1D時系列（加速度、角速度、COP軌跡等）
        m: 埋め込み次元（通常 2）
        r: 許容範囲（通常 0.2 × std(signal)）
            ※ r が 1.0 未満の場合は signal の標準偏差の比率として自動調整

    Returns:
        SampEn value (float). Higher = more irregular.

    アルゴリズム:
    1. 長さ m のテンプレートベクトルを構成
    2. 各テンプレートペアについて、Chebyshev距離 < r のペア数を数える → B_m
    3. 長さ m+1 で同様に計算 → A_m
    4. SampEn = -ln(A_m / B_m)
    """
    N = len(signal)
    if N < m + 2:
        return 0.0

    # r が 1.0 未満の場合、標準偏差の比率として扱う
    if r < 1.0:
        r = r * np.std(signal)
    if r == 0:
        return 0.0

    def _count_matches(templates: np.ndarray, r_val: float) -> int:
        count = 0
        n_templates = len(templates)
        for i in range(n_templates - 1):
            for j in range(i + 1, n_templates):
                if np.max(np.abs(templates[i] - templates[j])) < r_val:
                    count += 1
        return count

    # 長さ m と m+1 のテンプレートベクトルを構築
    templates_m = np.array([signal[i:i + m] for i in range(N - m)])
    templates_m1 = np.array([signal[i:i + m + 1] for i in range(N - m)])

    B = _count_matches(templates_m, r)
    A = _count_matches(templates_m1, r)

    if B == 0 or A == 0:
        return 0.0

    return -np.log(A / B)


def compute_neuromotor_noise(
    signal: np.ndarray,
    baseline_entropy: float = 0.3,
    injury_history_count: int = 0,
    beta: float = 2.0,
    alpha: float = 0.2,
    m: int = 2,
    r: float = 0.2,
) -> dict:
    """
    ニューロモーター・ノイズ指数（η_NM）の算出

    η_NM = sigmoid(β × (SampEn - μ_baseline)) × (1 + α × History)

    Args:
        signal: 加速度/COP時系列データ
        baseline_entropy: ベースラインのSampEn値（健常時の平均）
        injury_history_count: 過去の同部位負傷回数（Node 0から）
        beta: シグモイドの傾き（感度パラメータ）
        alpha: 既往歴の影響係数
        m: SampEn埋め込み次元
        r: SampEn許容範囲

    Returns: {
        'sample_entropy': float,
        'eta_nm': float,
        'effective_load_multiplier': float,
        'severity': 'normal' | 'mild' | 'moderate' | 'severe',
        'interpretation': str,
    }
    """
    sampen = compute_sample_entropy(signal, m, r)

    # シグモイド変換（ベースライン以下で ~0 となるように調整）
    # 標準シグモイドを [0, 1] にマッピングし、ベースライン時に ~0.1 となるよう設計
    z = beta * (sampen - baseline_entropy)
    raw_sigmoid = 1.0 / (1.0 + np.exp(-z))
    # ベースライン時のシグモイド出力 (z=0 → 0.5) を差し引いてスケーリング
    # これにより SampEn ≈ baseline → eta ≈ 0, SampEn >> baseline → eta → 1.0
    eta_base = max(0.0, (raw_sigmoid - 0.5) * 2.0)

    # 既往歴修正係数
    history_mod = 1.0 + alpha * injury_history_count

    eta_nm = eta_base * history_mod

    # 重症度分類
    if eta_nm < 0.15:
        severity = 'normal'
        interpretation = '神経筋制御は正常範囲内です。動作の規則性が保たれています。'
    elif eta_nm < 0.35:
        severity = 'mild'
        interpretation = '軽度の動作不安定性を検出。ウォーミングアップの延長を推奨します。'
    elif eta_nm < 0.60:
        severity = 'moderate'
        interpretation = '中等度の神経筋ノイズを検出。固有受容器トレーニングの追加を推奨します。'
    else:
        severity = 'severe'
        interpretation = '重度の動作不安定性。同一負荷でも局所ダメージが増幅されるリスクがあります。'

    return {
        'sample_entropy': round(sampen, 4),
        'eta_nm': round(eta_nm, 4),
        'effective_load_multiplier': round(1.0 + eta_nm, 4),
        'severity': severity,
        'interpretation': interpretation,
    }


def generate_synthetic_imu(
    n_samples: int = 1000,
    fs: float = 100.0,
    noise_level: str = 'normal',
) -> np.ndarray:
    """
    テスト用合成IMU加速度データの生成

    noise_level:
    - 'normal': 健常な歩行/ランニング（規則的）
    - 'mild': 軽度の不安定性
    - 'severe': 重度の不安定性（固有受容器不全シミュレーション）
    """
    t = np.linspace(0, n_samples / fs, n_samples)
    # 基本信号: 周期的な歩行パターン
    base = np.sin(2 * np.pi * 1.5 * t) + 0.3 * np.sin(2 * np.pi * 3.0 * t)

    noise_std_map: dict[str, float] = {
        'normal': 0.02,
        'mild': 0.15,
        'severe': 0.5,
    }
    noise_std = noise_std_map.get(noise_level, 0.05)
    noise = np.random.normal(0, noise_std, n_samples)

    # 重度の場合: 不規則なバーストを追加
    if noise_level == 'severe':
        burst_indices = np.random.choice(n_samples, size=n_samples // 20, replace=False)
        noise[burst_indices] *= 3.0

    return base + noise
