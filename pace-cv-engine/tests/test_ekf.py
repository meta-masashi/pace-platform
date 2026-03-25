"""PACE バイオメカニクスエンジン — EKF エンジンテスト.

拡張カルマンフィルタによるデカップリング検出の各種シナリオをテストする。
- 正直な報告（sRPE ≈ 客観的負荷）→ デカップリングなし
- 過少報告（sRPE ≪ 客観的負荷）→ デカップリング検出
- 低 kappa デバイス → より高い許容度
- 複数更新にわたる状態伝播
"""
from __future__ import annotations

import math
import sys
import os

import pytest

# テスト実行時のパス解決
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engines.ekf_engine import DecouplingEKF, run_ekf_step


# ─────────────────────────────────────────────────────────────────────
# テスト: 正直な報告 → デカップリングなし
# ─────────────────────────────────────────────────────────────────────

class TestHonestReporting:
    """sRPEが客観的負荷と一致する場合のテスト."""

    def test_no_decoupling_when_consistent(self) -> None:
        """sRPEと客観的負荷が一致 → デカップリングなし."""
        result = run_ekf_step(
            srpe=5.0,
            objective_load=5.0,
            device_kappa=0.9,
            previous_state=None,
            previous_covariance=None,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        assert not result["is_decoupled"], (
            f"一致する報告でデカップリングが検出されました: severity={result['decoupling_severity']:.4f}"
        )
        assert result["decoupling_severity"] < 0.5

    def test_low_residuals_when_consistent(self) -> None:
        """一致する報告では残差が小さい."""
        result = run_ekf_step(
            srpe=5.0,
            objective_load=5.0,
            device_kappa=0.9,
            previous_state=5.0,
            previous_covariance=0.5,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        # 残差は比較的小さいはず
        assert abs(result["srpe_residual"]) < 5.0, (
            f"sRPE残差が大きすぎます: {result['srpe_residual']:.4f}"
        )

    def test_estimated_fatigue_near_input(self) -> None:
        """一致する報告では推定疲労度が入力値に近い."""
        result = run_ekf_step(
            srpe=6.0,
            objective_load=6.0,
            device_kappa=0.95,
            previous_state=6.0,
            previous_covariance=0.5,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        # 推定疲労度が入力値の近傍にある
        assert abs(result["estimated_true_fatigue"] - 6.0) < 2.0, (
            f"推定疲労度が入力値から大きく乖離: {result['estimated_true_fatigue']:.4f}"
        )


# ─────────────────────────────────────────────────────────────────────
# テスト: 過少報告 → デカップリング検出
# ─────────────────────────────────────────────────────────────────────

class TestUnderreporting:
    """sRPEが客観的負荷より大幅に低い場合のテスト."""

    def test_decoupling_detected_when_underreporting(self) -> None:
        """sRPE ≪ 客観的負荷 → デカップリング検出."""
        # 数ステップ安定状態を作る
        state = 5.0
        cov = 0.5

        for _ in range(5):
            result = run_ekf_step(
                srpe=5.0,
                objective_load=5.0,
                device_kappa=0.9,
                previous_state=state,
                previous_covariance=cov,
                process_noise=0.1,
                measurement_noise_subjective=0.5,
                measurement_noise_objective=0.2,
            )
            state = result["updated_state"]
            cov = result["updated_cov"]

        # 突然の過少報告: sRPE=2.0 vs objective=8.0
        result = run_ekf_step(
            srpe=2.0,
            objective_load=8.0,
            device_kappa=0.9,
            previous_state=state,
            previous_covariance=cov,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        assert result["is_decoupled"], (
            f"過少報告でデカップリングが検出されませんでした: "
            f"mahal={result['mahalanobis_distance']:.4f}, "
            f"severity={result['decoupling_severity']:.4f}"
        )

    def test_severity_increases_with_discrepancy(self) -> None:
        """乖離が大きいほど重大度が高い."""
        state = 5.0
        cov = 0.5

        # 安定させる
        for _ in range(5):
            r = run_ekf_step(
                srpe=5.0,
                objective_load=5.0,
                device_kappa=0.9,
                previous_state=state,
                previous_covariance=cov,
                process_noise=0.1,
                measurement_noise_subjective=0.5,
                measurement_noise_objective=0.2,
            )
            state = r["updated_state"]
            cov = r["updated_cov"]

        # 中程度の乖離
        result_mild = run_ekf_step(
            srpe=3.5,
            objective_load=6.5,
            device_kappa=0.9,
            previous_state=state,
            previous_covariance=cov,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        # 大きな乖離
        result_severe = run_ekf_step(
            srpe=1.0,
            objective_load=9.0,
            device_kappa=0.9,
            previous_state=state,
            previous_covariance=cov,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        assert result_severe["decoupling_severity"] >= result_mild["decoupling_severity"], (
            f"大きな乖離の重大度が低い: "
            f"mild={result_mild['decoupling_severity']:.4f}, "
            f"severe={result_severe['decoupling_severity']:.4f}"
        )


# ─────────────────────────────────────────────────────────────────────
# テスト: 低 kappa デバイス → より高い許容度
# ─────────────────────────────────────────────────────────────────────

class TestLowKappa:
    """デバイス信頼度が低い場合のテスト."""

    def test_low_kappa_reduces_objective_influence(self) -> None:
        """低kappa → 客観的データの影響が小さくなる."""
        # 高kappa
        result_high_kappa = run_ekf_step(
            srpe=5.0,
            objective_load=8.0,
            device_kappa=0.95,
            previous_state=5.0,
            previous_covariance=0.5,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        # 低kappa
        result_low_kappa = run_ekf_step(
            srpe=5.0,
            objective_load=8.0,
            device_kappa=0.1,
            previous_state=5.0,
            previous_covariance=0.5,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        # 低kappaの場合、推定値はsRPE(5.0)により近くなるはず
        dist_high = abs(result_high_kappa["estimated_true_fatigue"] - 5.0)
        dist_low = abs(result_low_kappa["estimated_true_fatigue"] - 5.0)

        assert dist_low <= dist_high + 0.5, (
            f"低kappaで推定値がsRPEから遠い: high_dist={dist_high:.4f}, low_dist={dist_low:.4f}"
        )

    def test_low_kappa_higher_tolerance(self) -> None:
        """低kappa → デカップリング検出が発動しにくい."""
        # 安定した状態を構築
        state = 5.0
        cov = 0.5

        for _ in range(5):
            r = run_ekf_step(
                srpe=5.0,
                objective_load=5.0,
                device_kappa=0.9,
                previous_state=state,
                previous_covariance=cov,
                process_noise=0.1,
                measurement_noise_subjective=0.5,
                measurement_noise_objective=0.2,
            )
            state = r["updated_state"]
            cov = r["updated_cov"]

        # 中程度の乖離で比較
        result_high_k = run_ekf_step(
            srpe=3.0,
            objective_load=7.0,
            device_kappa=0.95,
            previous_state=state,
            previous_covariance=cov,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        result_low_k = run_ekf_step(
            srpe=3.0,
            objective_load=7.0,
            device_kappa=0.1,
            previous_state=state,
            previous_covariance=cov,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        # 低kappaの場合、重大度は低い（客観データのノイズが大きいため）
        assert result_low_k["decoupling_severity"] <= result_high_k["decoupling_severity"] + 0.1, (
            f"低kappaで重大度が高すぎます: "
            f"high_k={result_high_k['decoupling_severity']:.4f}, "
            f"low_k={result_low_k['decoupling_severity']:.4f}"
        )


# ─────────────────────────────────────────────────────────────────────
# テスト: 複数更新にわたる状態伝播
# ─────────────────────────────────────────────────────────────────────

class TestStatePropagation:
    """複数ステップにわたる状態更新の一貫性テスト."""

    def test_state_propagation_consistency(self) -> None:
        """状態と共分散が複数ステップで正しく伝播される."""
        state: float | None = None
        cov: float | None = None

        for step in range(10):
            result = run_ekf_step(
                srpe=5.0,
                objective_load=5.0,
                device_kappa=0.9,
                previous_state=state,
                previous_covariance=cov,
                process_noise=0.1,
                measurement_noise_subjective=0.5,
                measurement_noise_objective=0.2,
            )

            state = result["updated_state"]
            cov = result["updated_cov"]

            assert math.isfinite(state), f"step {step}: 状態が有限ではありません"
            assert math.isfinite(cov), f"step {step}: 共分散が有限ではありません"
            assert cov > 0, f"step {step}: 共分散が正ではありません"

    def test_covariance_convergence(self) -> None:
        """共分散が繰り返し更新で収束する."""
        state: float | None = None
        cov: float | None = None
        covariances: list[float] = []

        for _ in range(30):
            result = run_ekf_step(
                srpe=5.0,
                objective_load=5.0,
                device_kappa=0.9,
                previous_state=state,
                previous_covariance=cov,
                process_noise=0.1,
                measurement_noise_subjective=0.5,
                measurement_noise_objective=0.2,
            )

            state = result["updated_state"]
            cov = result["updated_cov"]
            covariances.append(cov)

        # 最後の5ステップでの共分散変動が小さい
        last_5 = covariances[-5:]
        variation = max(last_5) - min(last_5)
        assert variation < 0.1, (
            f"共分散が収束しませんでした: 変動 = {variation:.6f}"
        )

    def test_state_tracks_changing_load(self) -> None:
        """負荷の変化に状態が追従する."""
        state: float | None = None
        cov: float | None = None

        # 低負荷期
        for _ in range(10):
            result = run_ekf_step(
                srpe=3.0,
                objective_load=3.0,
                device_kappa=0.9,
                previous_state=state,
                previous_covariance=cov,
                process_noise=0.1,
                measurement_noise_subjective=0.5,
                measurement_noise_objective=0.2,
            )
            state = result["updated_state"]
            cov = result["updated_cov"]

        low_load_state = state

        # 高負荷期
        for _ in range(10):
            result = run_ekf_step(
                srpe=8.0,
                objective_load=8.0,
                device_kappa=0.9,
                previous_state=state,
                previous_covariance=cov,
                process_noise=0.1,
                measurement_noise_subjective=0.5,
                measurement_noise_objective=0.2,
            )
            state = result["updated_state"]
            cov = result["updated_cov"]

        high_load_state = state

        assert high_load_state > low_load_state, (  # type: ignore[operator]
            f"高負荷期の状態が低負荷期より高くありません: "
            f"low={low_load_state:.4f}, high={high_load_state:.4f}"
        )


# ─────────────────────────────────────────────────────────────────────
# テスト: DecouplingEKFクラスの直接テスト
# ─────────────────────────────────────────────────────────────────────

class TestDecouplingEKFClass:
    """DecouplingEKFクラスの直接テスト."""

    def test_predict_step(self) -> None:
        """予測ステップが正しく計算される."""
        ekf = DecouplingEKF(
            process_noise=0.1,
            measurement_noise_sub=0.5,
            measurement_noise_obj=0.2,
        )

        pred_state, pred_cov = ekf.predict(
            previous_state=5.0,
            previous_cov=1.0,
            objective_load=3.0,
        )

        # x_pred = F * x + B * u = 0.95 * 5.0 + 0.1 * 3.0 = 5.05
        expected_state = 0.95 * 5.0 + 0.1 * 3.0
        assert pred_state == pytest.approx(expected_state, rel=1e-6), (
            f"予測状態が不正: {pred_state:.4f} != {expected_state:.4f}"
        )

        # P_pred = F^2 * P + Q = 0.95^2 * 1.0 + 0.1 = 1.0025
        expected_cov = (0.95 ** 2) * 1.0 + 0.1
        assert pred_cov == pytest.approx(expected_cov, rel=1e-6), (
            f"予測共分散が不正: {pred_cov:.4f} != {expected_cov:.4f}"
        )

    def test_compute_severity_below_threshold(self) -> None:
        """閾値以下ではseverityがほぼ0."""
        severity = DecouplingEKF.compute_severity(1.0, threshold=3.0)
        assert severity < 0.1, f"閾値以下で severity が高すぎます: {severity:.4f}"

    def test_compute_severity_above_threshold(self) -> None:
        """閾値を大きく超えるとseverityがほぼ1."""
        severity = DecouplingEKF.compute_severity(6.0, threshold=3.0)
        assert severity > 0.9, f"閾値超過で severity が低すぎます: {severity:.4f}"

    def test_compute_severity_at_threshold(self) -> None:
        """閾値付近ではseverityが約0.5."""
        severity = DecouplingEKF.compute_severity(3.0, threshold=3.0)
        assert 0.3 < severity < 0.7, (
            f"閾値付近で severity が想定外: {severity:.4f}"
        )

    def test_detect_decoupling_method(self) -> None:
        """detect_decoupling メソッドが正しく動作する."""
        ekf = DecouplingEKF(
            process_noise=0.1,
            measurement_noise_sub=0.5,
            measurement_noise_obj=0.2,
        )

        # 小さなイノベーション → デカップリングなし
        is_dec, sev = ekf.detect_decoupling(
            innovation=0.5,
            innovation_cov=1.0,
            threshold=3.0,
        )
        assert not is_dec
        assert sev < 0.5

        # 大きなイノベーション → デカップリング検出
        is_dec, sev = ekf.detect_decoupling(
            innovation=10.0,
            innovation_cov=1.0,
            threshold=3.0,
        )
        assert is_dec
        assert sev > 0.5


# ─────────────────────────────────────────────────────────────────────
# テスト: エッジケース
# ─────────────────────────────────────────────────────────────────────

class TestEKFEdgeCases:
    """EKFの数値安定性エッジケーステスト."""

    def test_zero_srpe(self) -> None:
        """sRPE=0でも正常動作する."""
        result = run_ekf_step(
            srpe=0.0,
            objective_load=5.0,
            device_kappa=0.9,
            previous_state=None,
            previous_covariance=None,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        assert math.isfinite(result["estimated_true_fatigue"])
        assert math.isfinite(result["mahalanobis_distance"])

    def test_zero_objective_load(self) -> None:
        """客観的負荷0でも正常動作する."""
        result = run_ekf_step(
            srpe=5.0,
            objective_load=0.0,
            device_kappa=0.9,
            previous_state=None,
            previous_covariance=None,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        assert math.isfinite(result["estimated_true_fatigue"])

    def test_very_low_kappa(self) -> None:
        """非常に低いkappa値でもゼロ除算しない."""
        result = run_ekf_step(
            srpe=5.0,
            objective_load=5.0,
            device_kappa=0.001,
            previous_state=5.0,
            previous_covariance=1.0,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        assert math.isfinite(result["estimated_true_fatigue"])
        assert math.isfinite(result["updated_cov"])
        assert result["updated_cov"] > 0

    def test_large_covariance_initialization(self) -> None:
        """大きな初期共分散でも安定する."""
        result = run_ekf_step(
            srpe=5.0,
            objective_load=5.0,
            device_kappa=0.9,
            previous_state=5.0,
            previous_covariance=10000.0,
            process_noise=0.1,
            measurement_noise_subjective=0.5,
            measurement_noise_objective=0.2,
        )

        assert math.isfinite(result["estimated_true_fatigue"])
        assert result["updated_cov"] < 10000.0, "共分散が更新で減少しませんでした"
