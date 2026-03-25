"""
PACE v6.0 EKF デカップリング検出エンジン

拡張カルマンフィルタにより、選手の主観的疲労申告（sRPE）と
客観的負荷（GPS由来）の乖離を統計的に検出する。

純粋 numpy 実装（filterpy 不要、ポータビリティ重視）。
"""

from __future__ import annotations

import numpy as np


class EKFDecouplingEngine:
    """
    拡張カルマンフィルタによる主観-客観デカップリング検出

    1次元カルマンフィルタの簡略モデル:

    状態方程式:
        x_k = F · x_{k-1} + B · u_k + w_k
        x: 真の疲労状態（潜在変数）
        u: 客観的負荷（GPS由来）
        w: プロセスノイズ ~ N(0, Q)

    観測方程式:
        z_k = H · x_k + v_k
        z: sRPE（選手の主観的申告）
        v: 観測ノイズ ~ N(0, R)

    デカップリング検出:
        innovation（残差） ν_k = z_k - H · x_k|k-1
        |ν_k| > κ · √S_k の場合にデカップリングと判定
    """

    def __init__(
        self,
        process_noise: float = 0.1,
        measurement_noise: float = 0.5,
        kappa: float = 0.85,
    ) -> None:
        """
        EKF パラメータ初期化

        Args:
            process_noise:     プロセスノイズ分散 Q（モデルの不確実性）
            measurement_noise: 観測ノイズ分散 R（sRPE の測定誤差）
            kappa:             デカップリング判定閾値（標準偏差の倍数）
                              小さいほど敏感（偽陽性↑）、大きいほど鈍感
        """
        self.Q = process_noise      # プロセスノイズ分散
        self.R = measurement_noise  # 観測ノイズ分散
        self.kappa = kappa          # デカップリング判定閾値

        # カルマンフィルタのパラメータ（1次元スカラー）
        self.F = 0.95   # 状態遷移係数（疲労の自然減衰）
        self.B = 0.8    # 入力係数（負荷が疲労に与える影響）
        self.H = 1.0    # 観測係数（疲労→sRPE の変換）

        # 状態変数の初期化
        self.x: float = 0.0    # 状態推定値（真の疲労）
        self.P: float = 1.0    # 推定誤差分散

        # Innovation 履歴（プロット・分析用）
        self.innovation_history: list[float] = []
        self.state_history: list[float] = []
        self.gain_history: list[float] = []

    def predict(self, objective_load: float) -> float:
        """
        予測ステップ: 客観負荷から「あるべき疲労度」を推定

        x_k|k-1 = F · x_{k-1} + B · u_k
        P_k|k-1 = F · P_{k-1} · F^T + Q

        Args:
            objective_load: 客観的負荷（GPS由来）[0, 1]

        Returns:
            予測された疲労状態
        """
        # 状態予測（1次元なので行列演算は不要）
        self.x = self.F * self.x + self.B * objective_load

        # 誤差共分散予測
        self.P = self.F * self.P * self.F + self.Q

        return self.x

    def update(self, srpe: float) -> tuple[float, float]:
        """
        更新ステップ: sRPE（観測値）でフィルタを補正

        Innovation: ν_k = z_k - H · x_k|k-1
        Innovation 共分散: S_k = H · P_k|k-1 · H^T + R
        カルマンゲイン: K_k = P_k|k-1 · H^T / S_k
        状態更新: x_k = x_k|k-1 + K_k · ν_k
        誤差共分散更新: P_k = (1 - K_k · H) · P_k|k-1

        Args:
            srpe: 選手の主観的疲労申告（sRPE, 0.5-10スケール）

        Returns:
            (更新後の状態, innovation残差) のタプル
        """
        # Innovation（観測残差）
        innovation = srpe - self.H * self.x

        # Innovation 共分散
        S = self.H * self.P * self.H + self.R

        # カルマンゲイン
        K = self.P * self.H / S

        # 状態更新
        self.x = self.x + K * innovation

        # 誤差共分散更新（Joseph form for numerical stability）
        self.P = (1.0 - K * self.H) * self.P

        # 履歴に記録
        self.innovation_history.append(innovation)
        self.state_history.append(self.x)
        self.gain_history.append(K)

        return self.x, innovation

    def detect_decoupling(self, innovation: float) -> tuple[bool, str]:
        """
        デカップリング判定: 残差が統計的許容範囲外かどうか

        Innovation の標準偏差を推定し、κ倍を超える場合にフラグ。
        方向（過小/過大申告）も判定する。

        Args:
            innovation: update() で得られた innovation 残差

        Returns:
            (デカップリング検出フラグ, 判定理由) のタプル
        """
        # Innovation の標準偏差を推定（直近の履歴から）
        if len(self.innovation_history) < 5:
            # データ不足時は固定閾値を使用
            innovation_std = np.sqrt(self.R)
        else:
            # 直近30日の innovation から標準偏差を推定
            recent = self.innovation_history[-30:]
            innovation_std = max(np.std(recent), 0.1)  # 下限を設定

        threshold = self.kappa * innovation_std

        if innovation < -threshold:
            # sRPE が期待より低い → 過小申告の疑い
            return True, "UNDERREPORT"
        elif innovation > threshold:
            # sRPE が期待より高い → 過大申告 or 体調不良
            return True, "OVERREPORT"
        else:
            return False, "NORMAL"

    def process_day(
        self, objective_load: float, srpe: float
    ) -> dict[str, float | bool | str]:
        """
        1日分のデータを処理（predict + update + detect を一括実行）

        Args:
            objective_load: 客観的負荷 [0, 1]
            srpe: 主観的疲労 [0.5, 10]

        Returns:
            結果辞書: predicted_state, updated_state, innovation,
                     is_decoupled, decoupling_type, kalman_gain
        """
        predicted = self.predict(objective_load)
        updated, innovation = self.update(srpe)
        is_decoupled, decoupling_type = self.detect_decoupling(innovation)

        return {
            "predicted_state": predicted,
            "updated_state": updated,
            "innovation": innovation,
            "is_decoupled": is_decoupled,
            "decoupling_type": decoupling_type,
            "kalman_gain": self.gain_history[-1],
        }

    def reset(self) -> None:
        """
        新しい選手用にフィルタをリセット

        状態・誤差共分散・履歴をすべて初期化する。
        パラメータ（Q, R, kappa）は保持される。
        """
        self.x = 0.0
        self.P = 1.0
        self.innovation_history.clear()
        self.state_history.clear()
        self.gain_history.clear()

    def get_innovation_stats(self) -> dict[str, float]:
        """
        Innovation の統計量を返す（診断用）

        Returns:
            mean, std, min, max, n_decoupled, decoupling_rate
        """
        if not self.innovation_history:
            return {
                "mean": 0.0, "std": 0.0, "min": 0.0, "max": 0.0,
                "n_decoupled": 0, "decoupling_rate": 0.0,
            }

        innovations = np.array(self.innovation_history)
        innovation_std = np.std(innovations) if len(innovations) > 1 else np.sqrt(self.R)
        threshold = self.kappa * max(innovation_std, 0.1)
        n_decoupled = int(np.sum(np.abs(innovations) > threshold))

        return {
            "mean": float(np.mean(innovations)),
            "std": float(np.std(innovations)),
            "min": float(np.min(innovations)),
            "max": float(np.max(innovations)),
            "n_decoupled": n_decoupled,
            "decoupling_rate": n_decoupled / len(innovations),
        }
