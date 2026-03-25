"""
PACE v6.0 ODE 損傷エンジン

組織特異的損傷修復の非線形微分方程式を数値的に解く。
オイラー法を使用（日次タイムステップで十分な安定性）。
"""

from __future__ import annotations

import numpy as np


class ODEDamageEngine:
    """
    組織特異的損傷修復の非線形微分方程式エンジン

    基本方程式:
        dD/dt = α · Load(t)^m − β · D(t) · exp(−τ · D(t))

    第1項: 負荷による損傷蓄積（べき乗則）
        - α: 損傷蓄積率（組織の脆弱性）
        - m: 非線形性指数（m>1 で高負荷が不均衡に危険）

    第2項: 生物学的修復（飽和型）
        - β: 修復率ベース
        - τ: 修復飽和係数（損傷が大きいと修復効率が低下）
        - exp(-τ·D) により、損傷が蓄積すると修復が遅くなる

    臨界点:
        D >= D_crit の場合、組織破壊リスクが急激に上昇
    """

    # 組織タイプ別のデフォルトパラメータ
    TISSUE_PRESETS: dict[str, dict[str, float]] = {
        "muscle": {"alpha": 0.015, "beta": 0.6, "tau": 1.5, "m": 1.8, "d_crit": 0.8},
        "tendon": {"alpha": 0.010, "beta": 0.3, "tau": 3.0, "m": 2.2, "d_crit": 0.75},
        "ligament": {"alpha": 0.008, "beta": 0.25, "tau": 3.5, "m": 2.5, "d_crit": 0.7},
        "bone": {"alpha": 0.005, "beta": 0.4, "tau": 2.0, "m": 3.0, "d_crit": 0.65},
    }

    def __init__(
        self,
        alpha: float = 0.01,
        beta: float = 0.5,
        tau: float = 2.0,
        m: float = 2.0,
        d_crit: float = 0.8,
    ) -> None:
        """
        パラメータ初期化

        Args:
            alpha: 損傷蓄積率 [0.001, 0.1]
            beta:  修復率ベース [0.1, 1.0]
            tau:   修復飽和係数 [0.5, 5.0]
            m:     負荷-損傷の非線形性 [1.0, 3.0]
            d_crit: 臨界損傷閾値 [0.6, 1.0]
        """
        self.alpha = alpha
        self.beta = beta
        self.tau = tau
        self.m = m
        self.d_crit = d_crit

    @classmethod
    def from_tissue(cls, tissue_type: str) -> "ODEDamageEngine":
        """
        組織タイプからプリセットパラメータでエンジンを生成

        Args:
            tissue_type: "muscle", "tendon", "ligament", "bone"

        Returns:
            組織特異的パラメータを持つ ODEDamageEngine
        """
        if tissue_type not in cls.TISSUE_PRESETS:
            raise ValueError(
                f"Unknown tissue type: {tissue_type}. "
                f"Available: {list(cls.TISSUE_PRESETS.keys())}"
            )
        return cls(**cls.TISSUE_PRESETS[tissue_type])

    def _dD_dt(self, D: float, load: float) -> float:
        """
        損傷変化率の計算

        dD/dt = α · Load^m − β · D · exp(−τ · D)

        Args:
            D: 現在の損傷度 [0, 1]
            load: 現在の負荷 [0, 1]

        Returns:
            損傷変化率
        """
        # 損傷蓄積項（負荷のべき乗）
        accumulation = self.alpha * (load ** self.m)

        # 修復項（損傷レベルに依存する飽和型修復）
        # D が大きいと exp(-τ·D) が小さくなり、修復効率が低下
        repair = self.beta * D * np.exp(-self.tau * D)

        return accumulation - repair

    def step(self, D_prev: float, load: float, dt: float = 1.0) -> float:
        """
        1日分のダメージ更新（前進オイラー法）

        D_{n+1} = D_n + dt · dD/dt(D_n, Load_n)

        安定性: dt · (α · Load_max^m + β) < 1 であれば安定

        Args:
            D_prev: 前日の損傷度
            load:   当日の負荷 [0, 1]
            dt:     タイムステップ（デフォルト=1日）

        Returns:
            更新後の損傷度（[0, 1] にクリップ）
        """
        dD = self._dD_dt(D_prev, load)
        D_new = D_prev + dt * dD

        # 物理的制約: 損傷度は [0, 1] の範囲
        return float(np.clip(D_new, 0.0, 1.0))

    def simulate(self, loads: np.ndarray) -> np.ndarray:
        """
        負荷時系列からダメージ時系列を計算

        Args:
            loads: 負荷の時系列 [0, 1]、shape=(n_days,)

        Returns:
            損傷度の時系列、shape=(n_days,)
        """
        n = len(loads)
        damage = np.zeros(n)
        D = 0.0  # 初期損傷度

        for i in range(n):
            load = loads[i]
            # NaN の場合は休息（load=0）として扱う
            if np.isnan(load):
                load = 0.0
            D = self.step(D, load)
            damage[i] = D

        return damage

    def is_critical(self, D: float) -> bool:
        """
        臨界点超過判定

        D >= D_crit の場合、組織破壊リスクが高い状態

        Args:
            D: 損傷度

        Returns:
            臨界点を超過しているかどうか
        """
        return D >= self.d_crit

    def risk_category(self, D: float) -> str:
        """
        損傷度からリスクカテゴリを判定

        Args:
            D: 損傷度 [0, 1]

        Returns:
            リスクカテゴリ: "GREEN", "YELLOW", "ORANGE", "RED"
        """
        if D >= self.d_crit:
            return "RED"
        elif D >= self.d_crit * 0.75:
            return "ORANGE"
        elif D >= self.d_crit * 0.5:
            return "YELLOW"
        else:
            return "GREEN"
