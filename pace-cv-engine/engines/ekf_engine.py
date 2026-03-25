"""PACE バイオメカニクスエンジン — 拡張カルマンフィルタ（EKF）デカップリング検出.

Sprint 2 (Tasks #7-11): 主観的RPE (sRPE) と客観的負荷 (IMU) の乖離を
拡張カルマンフィルタを用いて検出する。

状態空間モデル:
  - 状態: x = 真の疲労度（隠れ変数）
  - 状態方程式: x_k = F * x_{k-1} + B * u_k + w_k  (u_k = 客観的負荷)
  - 観測方程式: z_k = H * x_k + v_k  (z_k = sRPE)

デバイス信頼度 kappa が低い場合、客観的測定ノイズを増大させ、
主観データへの依存度を自動的に高める。
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np


# ─────────────────────────────────────────────────────────────────────
# 定数
# ─────────────────────────────────────────────────────────────────────

_COVARIANCE_FLOOR: float = 1e-6
"""共分散の下限（数値安定性のため）"""

_COVARIANCE_CEILING: float = 1e6
"""共分散の上限（発散防止）"""

_KAPPA_EPSILON: float = 1e-3
"""kappa のゼロ除算防止用最小値"""

_DEFAULT_F: float = 0.95
"""状態遷移係数（疲労の自然減衰: 1日で5%回復）"""

_DEFAULT_B: float = 0.1
"""制御入力係数（客観的負荷が状態に与える影響）"""


# ─────────────────────────────────────────────────────────────────────
# デカップリングEKFクラス
# ─────────────────────────────────────────────────────────────────────

class DecouplingEKF:
    """主観-客観デカップリング検出用の拡張カルマンフィルタ.

    sRPE（主観的RPE）と IMU由来の客観的負荷の間の乖離を検出する。
    デバイス信頼度 kappa に基づいて測定ノイズを動的に調整し、
    マハラノビス距離によるカイ二乗検定で異常（デカップリング）を判定する。

    Attributes:
        Q: プロセスノイズ共分散
        R_sub: 主観的測定ノイズ共分散
        R_obj: 客観的測定ノイズ共分散（基準値）
        F: 状態遷移係数
        B: 制御入力係数
    """

    def __init__(
        self,
        process_noise: float,
        measurement_noise_sub: float,
        measurement_noise_obj: float,
        F: float = _DEFAULT_F,
        B: float = _DEFAULT_B,
    ) -> None:
        """EKFを初期化する.

        Args:
            process_noise: プロセスノイズ Q (> 0)
            measurement_noise_sub: 主観的測定ノイズ R_subjective (> 0)
            measurement_noise_obj: 客観的測定ノイズ R_objective (> 0)
            F: 状態遷移係数（デフォルト: 0.95）
            B: 制御入力係数（デフォルト: 0.1）
        """
        self.Q = max(process_noise, _COVARIANCE_FLOOR)
        self.R_sub = max(measurement_noise_sub, _COVARIANCE_FLOOR)
        self.R_obj = max(measurement_noise_obj, _COVARIANCE_FLOOR)
        self.F = F
        self.B = B

    def predict(
        self,
        previous_state: float,
        previous_cov: float,
        objective_load: float,
    ) -> tuple[float, float]:
        """予測ステップ: 前回の状態から次の状態を予測する.

        状態方程式:
            x_pred = F * x_{k-1} + B * u_k
            P_pred = F^2 * P_{k-1} + Q

        Args:
            previous_state: 前回の状態推定値 x_{k-1}
            previous_cov: 前回の誤差共分散 P_{k-1}
            objective_load: 客観的負荷 u_k

        Returns:
            (予測状態, 予測共分散) のタプル
        """
        # 状態予測
        predicted_state = self.F * previous_state + self.B * objective_load

        # 共分散予測
        predicted_cov = (self.F ** 2) * max(previous_cov, _COVARIANCE_FLOOR) + self.Q

        # 共分散クランプ
        predicted_cov = min(predicted_cov, _COVARIANCE_CEILING)

        return predicted_state, predicted_cov

    def update(
        self,
        predicted_state: float,
        predicted_cov: float,
        srpe: float,
        objective_load: float,
        kappa: float,
    ) -> dict[str, Any]:
        """更新ステップ: 観測データで状態推定を補正する.

        2つの観測（sRPEと客観的負荷）を逐次的に融合する。
        デバイス信頼度 kappa が低い場合、客観的測定ノイズを増大させ、
        客観データの重みを自動的に下げる。

        Args:
            predicted_state: 予測状態 x_pred
            predicted_cov: 予測共分散 P_pred
            srpe: 主観的RPE (0-10)
            objective_load: 客観的負荷
            kappa: デバイス信頼度 (0-1)

        Returns:
            更新結果を含む辞書:
              - updated_state: 更新後の状態
              - updated_cov: 更新後の共分散
              - srpe_residual: sRPE残差
              - objective_residual: 客観的残差
              - mahalanobis_distance: マハラノビス距離
              - is_decoupled: デカップリング検出フラグ
              - decoupling_severity: 重大度 (0-1)
        """
        # kappa を安全な範囲にクランプ
        kappa_safe = max(kappa, _KAPPA_EPSILON)

        # 客観的測定ノイズをkappaで調整（低信頼度 → 高ノイズ）
        R_obj_adjusted = self.R_obj / (kappa_safe ** 2)

        # ── 第1更新: sRPE による更新 ──
        # 観測モデル: z_srpe = H_sub * x + v_sub, H_sub = 1
        H_sub = 1.0
        innovation_sub = srpe - H_sub * predicted_state
        S_sub = H_sub * predicted_cov * H_sub + self.R_sub

        # カルマンゲイン
        S_sub_safe = max(S_sub, _COVARIANCE_FLOOR)
        K_sub = predicted_cov * H_sub / S_sub_safe

        # 状態と共分散を更新
        state_after_sub = predicted_state + K_sub * innovation_sub
        cov_after_sub = (1.0 - K_sub * H_sub) * predicted_cov
        cov_after_sub = max(cov_after_sub, _COVARIANCE_FLOOR)

        # ── 第2更新: 客観的負荷による更新 ──
        # 観測モデル: z_obj = H_obj * x + v_obj, H_obj = 1
        H_obj = 1.0
        innovation_obj = objective_load - H_obj * state_after_sub
        S_obj = H_obj * cov_after_sub * H_obj + R_obj_adjusted

        # カルマンゲイン
        S_obj_safe = max(S_obj, _COVARIANCE_FLOOR)
        K_obj = cov_after_sub * H_obj / S_obj_safe

        # 最終状態と共分散
        updated_state = state_after_sub + K_obj * innovation_obj
        updated_cov = (1.0 - K_obj * H_obj) * cov_after_sub
        updated_cov = max(updated_cov, _COVARIANCE_FLOOR)
        updated_cov = min(updated_cov, _COVARIANCE_CEILING)

        # ── デカップリング検出 ──
        # sRPEと客観的負荷の両方のイノベーションを使用
        # 結合イノベーション共分散
        innovation_cov = S_sub + S_obj
        innovation_cov_safe = max(innovation_cov, _COVARIANCE_FLOOR)

        # マハラノビス距離（簡易版: 2観測のイノベーション）
        combined_innovation_sq = innovation_sub ** 2 / S_sub_safe + innovation_obj ** 2 / S_obj_safe
        mahalanobis_distance = math.sqrt(max(combined_innovation_sq, 0.0))

        # デカップリング判定
        is_decoupled, severity = self.detect_decoupling(
            innovation_sub, S_sub_safe, threshold=3.0
        )

        # マハラノビス距離による重大度の再計算（両観測を考慮）
        severity = self.compute_severity(mahalanobis_distance, threshold=3.0)
        if mahalanobis_distance > 3.0:
            is_decoupled = True

        return {
            "updated_state": updated_state,
            "updated_cov": updated_cov,
            "srpe_residual": innovation_sub,
            "objective_residual": innovation_obj,
            "mahalanobis_distance": mahalanobis_distance,
            "is_decoupled": is_decoupled,
            "decoupling_severity": severity,
        }

    def detect_decoupling(
        self,
        innovation: float,
        innovation_cov: float,
        threshold: float = 3.0,
    ) -> tuple[bool, float]:
        """カイ二乗検定によるデカップリング検出.

        正規化されたイノベーション（マハラノビス距離）が閾値を超えた場合、
        デカップリング（異常）として判定する。

        Args:
            innovation: イノベーション（残差）
            innovation_cov: イノベーション共分散
            threshold: 検出閾値（デフォルト: 3.0σ）

        Returns:
            (is_decoupled, severity) のタプル
        """
        cov_safe = max(innovation_cov, _COVARIANCE_FLOOR)
        normalized = abs(innovation) / math.sqrt(cov_safe)

        is_decoupled = normalized > threshold
        severity = self.compute_severity(normalized, threshold)

        return is_decoupled, severity

    @staticmethod
    def compute_severity(
        mahalanobis_distance: float,
        threshold: float,
    ) -> float:
        """マハラノビス距離から重大度スコア (0-1) を計算する.

        シグモイド関数を用いて、閾値付近で急激に変化するスコアを生成する。
        閾値以下ではほぼ0、閾値を大きく超えるとほぼ1に飽和する。

        Args:
            mahalanobis_distance: マハラノビス距離
            threshold: 検出閾値

        Returns:
            重大度スコア (0-1)
        """
        if threshold <= 0:
            return 1.0 if mahalanobis_distance > 0 else 0.0

        # シグモイド: severity = 1 / (1 + exp(-k * (d - threshold)))
        # k = 2.0 でスムーズな遷移
        k = 2.0
        exponent = -k * (mahalanobis_distance - threshold)

        # オーバーフロー防止
        if exponent > 500.0:
            return 0.0
        if exponent < -500.0:
            return 1.0

        return 1.0 / (1.0 + math.exp(exponent))


# ─────────────────────────────────────────────────────────────────────
# ユーティリティ関数
# ─────────────────────────────────────────────────────────────────────

def run_ekf_step(
    srpe: float,
    objective_load: float,
    device_kappa: float,
    previous_state: float | None,
    previous_covariance: float | None,
    process_noise: float,
    measurement_noise_subjective: float,
    measurement_noise_objective: float,
) -> dict[str, Any]:
    """EKFの1ステップ実行のヘルパー関数.

    APIエンドポイントからの呼び出しを簡素化するためのラッパー。

    Args:
        srpe: 主観的RPE (0-10)
        objective_load: IMU由来の客観的負荷
        device_kappa: デバイス信頼度 (0-1)
        previous_state: 前回の状態推定値（Noneの場合、sRPEで初期化）
        previous_covariance: 前回の誤差共分散（Noneの場合、1.0で初期化）
        process_noise: プロセスノイズ Q
        measurement_noise_subjective: 主観的測定ノイズ R_subjective
        measurement_noise_objective: 客観的測定ノイズ R_objective

    Returns:
        EKF更新結果の辞書
    """
    ekf = DecouplingEKF(
        process_noise=process_noise,
        measurement_noise_sub=measurement_noise_subjective,
        measurement_noise_obj=measurement_noise_objective,
    )

    # 初期状態の設定
    if previous_state is None:
        # sRPEで初期化（最初のステップ）
        prev_state = srpe
    else:
        prev_state = previous_state

    if previous_covariance is None:
        prev_cov = 1.0
    else:
        prev_cov = max(previous_covariance, _COVARIANCE_FLOOR)

    # 予測ステップ
    predicted_state, predicted_cov = ekf.predict(
        previous_state=prev_state,
        previous_cov=prev_cov,
        objective_load=objective_load,
    )

    # 更新ステップ
    result = ekf.update(
        predicted_state=predicted_state,
        predicted_cov=predicted_cov,
        srpe=srpe,
        objective_load=objective_load,
        kappa=device_kappa,
    )

    # 推定真疲労度（更新後の状態）
    result["estimated_true_fatigue"] = result["updated_state"]

    return result
