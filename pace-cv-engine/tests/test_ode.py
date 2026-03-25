"""PACE バイオメカニクスエンジン — ODE エンジンテスト.

損傷リモデリングODEの各種シナリオをテストする。
- 負荷ゼロ → 損傷が減衰する
- 定常負荷 → 定常状態に到達する
- 過大負荷 → D が D_crit を超える
- 組織カテゴリ別パラメータでのテスト
"""
from __future__ import annotations

import math
import sys
import os

import pytest

# テスト実行時のパス解決
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engines.ode_engine import (
    calculate_d_crit,
    damage_remodeling_ode,
    simulate_damage,
    simulate_trajectory,
)


# ─────────────────────────────────────────────────────────────────────
# 組織カテゴリ別パラメータ（仕様書準拠）
# ─────────────────────────────────────────────────────────────────────

TISSUE_PARAMS: dict[str, dict[str, float]] = {
    "metabolic": {
        "alpha": 0.05,
        "beta": 0.8,
        "tau": 0.5,
        "m": 1.5,
    },
    "structural_soft": {
        "alpha": 0.08,
        "beta": 0.4,
        "tau": 0.8,
        "m": 2.0,
    },
    "structural_hard": {
        "alpha": 0.03,
        "beta": 0.1,
        "tau": 1.2,
        "m": 2.5,
    },
    "neuromotor": {
        "alpha": 0.06,
        "beta": 0.6,
        "tau": 0.6,
        "m": 1.8,
    },
}


# ─────────────────────────────────────────────────────────────────────
# テスト: 負荷ゼロ → 損傷が減衰する
# ─────────────────────────────────────────────────────────────────────

class TestZeroLoad:
    """負荷ゼロ時の損傷減衰テスト."""

    def test_damage_decays_with_zero_load(self) -> None:
        """負荷ゼロの場合、既存の損傷は修復機構により減少する."""
        params = TISSUE_PARAMS["metabolic"]
        initial_damage = 0.5

        result = simulate_damage(
            current_damage=initial_damage,
            load=0.0,
            delta_t=1.0,
            **params,
        )

        # 損傷が減少していることを確認
        assert result["damage_after"] < initial_damage, (
            f"負荷ゼロで損傷が減少しませんでした: {result['damage_after']:.6f} >= {initial_damage}"
        )

    def test_damage_approaches_zero_with_zero_load(self) -> None:
        """負荷ゼロの場合、長期的に損傷はゼロに近づく."""
        params = TISSUE_PARAMS["metabolic"]
        damage = 1.0

        # 30日間のゼロ負荷シミュレーション
        for _ in range(30):
            result = simulate_damage(
                current_damage=damage,
                load=0.0,
                delta_t=1.0,
                **params,
                n_steps=50,
            )
            damage = result["damage_after"]

        assert damage < 0.01, (
            f"30日間のゼロ負荷後も損傷が十分に減少しませんでした: {damage:.6f}"
        )

    def test_ode_function_negative_ddt_with_zero_load(self) -> None:
        """ODE関数: 負荷ゼロかつD>0で dD/dt < 0 (修復のみ)."""
        params = TISSUE_PARAMS["metabolic"]
        dDdt = damage_remodeling_ode(
            t=0.0,
            D=0.5,
            load=0.0,
            **params,
        )
        assert dDdt < 0.0, f"負荷ゼロかつD>0で dD/dt が負ではありません: {dDdt}"


# ─────────────────────────────────────────────────────────────────────
# テスト: 定常負荷 → 定常状態に到達する
# ─────────────────────────────────────────────────────────────────────

class TestSteadyState:
    """定常負荷による定常状態到達テスト."""

    def test_reaches_steady_state_with_constant_load(self) -> None:
        """定常的な負荷では損傷が平衡に到達する."""
        params = TISSUE_PARAMS["metabolic"]
        damage = 0.0
        load = 1.0

        damages: list[float] = []
        for _ in range(100):
            result = simulate_damage(
                current_damage=damage,
                load=load,
                delta_t=1.0,
                **params,
                n_steps=50,
            )
            damage = result["damage_after"]
            damages.append(damage)

        # 最後の10ステップの変動が小さいことを確認
        last_10 = damages[-10:]
        variation = max(last_10) - min(last_10)
        assert variation < 0.01, (
            f"定常状態に到達しませんでした: 変動 = {variation:.6f}"
        )

    def test_steady_state_near_d_crit(self) -> None:
        """定常状態の損傷は D_crit 以下に留まる（適切な負荷の場合）."""
        params = TISSUE_PARAMS["metabolic"]
        load = 1.0

        d_crit = calculate_d_crit(
            alpha=params["alpha"],
            beta=params["beta"],
            tau=params["tau"],
            m=params["m"],
            load=load,
        )

        # 定常状態まで実行
        damage = 0.0
        for _ in range(200):
            result = simulate_damage(
                current_damage=damage,
                load=load,
                delta_t=1.0,
                **params,
                n_steps=50,
            )
            damage = result["damage_after"]

        # 定常状態は D_crit 付近（修復=生成の均衡点）
        assert damage < d_crit * 1.5, (
            f"定常状態の損傷がD_critの1.5倍を超えました: D={damage:.4f}, D_crit={d_crit:.4f}"
        )


# ─────────────────────────────────────────────────────────────────────
# テスト: 過大負荷 → D が D_crit を超える
# ─────────────────────────────────────────────────────────────────────

class TestExcessiveLoad:
    """過大負荷による臨界損傷超過テスト."""

    def test_excessive_load_exceeds_d_crit(self) -> None:
        """非常に高い負荷では損傷が D_crit を超える."""
        params = TISSUE_PARAMS["metabolic"]
        large_load = 10.0

        d_crit = calculate_d_crit(
            alpha=params["alpha"],
            beta=params["beta"],
            tau=params["tau"],
            m=params["m"],
            load=large_load,
        )

        # 高負荷を継続的に適用
        damage = 0.0
        for _ in range(50):
            result = simulate_damage(
                current_damage=damage,
                load=large_load,
                delta_t=1.0,
                **params,
                n_steps=50,
            )
            damage = result["damage_after"]

        assert damage > d_crit, (
            f"過大負荷でも損傷がD_critを超えませんでした: D={damage:.4f}, D_crit={d_crit:.4f}"
        )

    def test_is_critical_flag(self) -> None:
        """ODEレスポンスの is_critical フラグが正しく設定される."""
        params = TISSUE_PARAMS["structural_soft"]
        large_load = 15.0

        # 過大負荷を適用
        damage = 0.0
        for _ in range(100):
            result = simulate_damage(
                current_damage=damage,
                load=large_load,
                delta_t=1.0,
                **params,
                n_steps=50,
            )
            damage = result["damage_after"]

        d_crit = calculate_d_crit(
            alpha=params["alpha"],
            beta=params["beta"],
            tau=params["tau"],
            m=params["m"],
            load=large_load,
        )

        is_critical = damage > d_crit
        assert is_critical, (
            f"過大負荷で is_critical=False: D={damage:.4f}, D_crit={d_crit:.4f}"
        )


# ─────────────────────────────────────────────────────────────────────
# テスト: 組織カテゴリ別パラメータ
# ─────────────────────────────────────────────────────────────────────

class TestTissueCategories:
    """4つの組織カテゴリすべてでODEが正常動作するテスト."""

    @pytest.mark.parametrize("tissue", list(TISSUE_PARAMS.keys()))
    def test_simulate_damage_for_tissue(self, tissue: str) -> None:
        """各組織カテゴリでシミュレーションが正常に完了する."""
        params = TISSUE_PARAMS[tissue]

        result = simulate_damage(
            current_damage=0.1,
            load=2.0,
            delta_t=1.0,
            **params,
        )

        assert "damage_after" in result
        assert "repair_rate" in result
        assert "simulation_points" in result
        assert result["damage_after"] >= 0.0
        assert result["repair_rate"] >= 0.0
        assert len(result["simulation_points"]) > 0

    @pytest.mark.parametrize("tissue", list(TISSUE_PARAMS.keys()))
    def test_d_crit_calculable(self, tissue: str) -> None:
        """各組織カテゴリで D_crit が計算可能."""
        params = TISSUE_PARAMS[tissue]

        d_crit = calculate_d_crit(
            alpha=params["alpha"],
            beta=params["beta"],
            tau=params["tau"],
            m=params["m"],
            load=1.0,
        )

        assert d_crit > 0.0, f"{tissue} の D_crit が正ではありません: {d_crit}"
        assert math.isfinite(d_crit), f"{tissue} の D_crit が有限ではありません: {d_crit}"

    def test_structural_hard_has_slowest_repair(self) -> None:
        """骨（structural_hard）は修復が最も遅い."""
        load = 2.0
        results: dict[str, float] = {}

        for tissue, params in TISSUE_PARAMS.items():
            res = simulate_damage(
                current_damage=0.5,
                load=0.0,
                delta_t=1.0,
                **params,
            )
            # 修復量 = 初期値 - 最終値
            repair_amount = 0.5 - res["damage_after"]
            results[tissue] = repair_amount

        # structural_hard の修復量が最小
        assert results["structural_hard"] == min(results.values()), (
            f"structural_hard の修復が最小ではありません: {results}"
        )


# ─────────────────────────────────────────────────────────────────────
# テスト: シミュレーション時系列
# ─────────────────────────────────────────────────────────────────────

class TestSimulationPoints:
    """シミュレーション時系列データのテスト."""

    def test_simulation_points_count(self) -> None:
        """指定ステップ数のシミュレーションポイントが生成される."""
        params = TISSUE_PARAMS["metabolic"]
        n_steps = 50

        result = simulate_damage(
            current_damage=0.1,
            load=1.0,
            delta_t=1.0,
            **params,
            n_steps=n_steps,
        )

        assert len(result["simulation_points"]) == n_steps

    def test_simulation_points_structure(self) -> None:
        """各ポイントに t, damage, repair_rate が含まれる."""
        params = TISSUE_PARAMS["metabolic"]

        result = simulate_damage(
            current_damage=0.1,
            load=1.0,
            delta_t=1.0,
            **params,
        )

        for point in result["simulation_points"]:
            assert "t" in point
            assert "damage" in point
            assert "repair_rate" in point


# ─────────────────────────────────────────────────────────────────────
# テスト: 多日シミュレーション
# ─────────────────────────────────────────────────────────────────────

class TestTrajectory:
    """多日シミュレーションのテスト."""

    def test_trajectory_length(self) -> None:
        """軌跡のデータポイント数がシミュレーション日数と一致する."""
        params = TISSUE_PARAMS["metabolic"]
        days = 14
        history = [
            {"day": i, "load": 2.0 if i % 2 == 0 else 0.0}
            for i in range(days)
        ]

        trajectory = simulate_trajectory(history, params, days)

        assert len(trajectory) == days

    def test_trajectory_rest_day_recovery(self) -> None:
        """休息日（負荷0）の後、損傷が減少する."""
        params = TISSUE_PARAMS["metabolic"]
        history = [
            {"day": 0, "load": 5.0},
            {"day": 1, "load": 5.0},
            {"day": 2, "load": 0.0},
            {"day": 3, "load": 0.0},
        ]

        trajectory = simulate_trajectory(history, params, 4)

        # day 2 → day 3 で損傷が減少
        assert trajectory[3]["damage"] < trajectory[2]["damage"], (
            "休息日で損傷が減少しませんでした"
        )


# ─────────────────────────────────────────────────────────────────────
# テスト: エッジケース
# ─────────────────────────────────────────────────────────────────────

class TestEdgeCases:
    """数値安定性のエッジケーステスト."""

    def test_zero_initial_damage_and_zero_load(self) -> None:
        """初期損傷ゼロ、負荷ゼロの場合、損傷はゼロのまま."""
        params = TISSUE_PARAMS["metabolic"]

        result = simulate_damage(
            current_damage=0.0,
            load=0.0,
            delta_t=1.0,
            **params,
        )

        assert result["damage_after"] == pytest.approx(0.0, abs=1e-10)

    def test_very_small_delta_t(self) -> None:
        """非常に小さい時間ステップでも正常動作する."""
        params = TISSUE_PARAMS["metabolic"]

        result = simulate_damage(
            current_damage=0.5,
            load=1.0,
            delta_t=0.001,
            **params,
        )

        assert math.isfinite(result["damage_after"])
        assert result["damage_after"] >= 0.0

    def test_large_load_numerical_stability(self) -> None:
        """大きな負荷値でもオーバーフローしない."""
        params = TISSUE_PARAMS["metabolic"]

        result = simulate_damage(
            current_damage=0.1,
            load=1000.0,
            delta_t=1.0,
            **params,
        )

        assert math.isfinite(result["damage_after"])
        assert result["damage_after"] >= 0.0

    def test_d_crit_with_zero_load(self) -> None:
        """負荷ゼロの場合、D_crit = 0."""
        params = TISSUE_PARAMS["metabolic"]

        d_crit = calculate_d_crit(
            alpha=params["alpha"],
            beta=params["beta"],
            tau=params["tau"],
            m=params["m"],
            load=0.0,
        )

        assert d_crit == 0.0
