"""
PACE v6.0 バックテスト・パイプライン テストスイート

pytest 互換のユニットテスト。
各コンポーネントの基本動作を検証する。

実行:
  pytest test_backtest.py -v
  python -m pytest test_backtest.py -v
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ode_engine import ODEDamageEngine
from ekf_engine import EKFDecouplingEngine
from etl import generate_synthetic_dataset, preprocess_sports_data
from evaluator import evaluate_backtest, _compute_roc_auc


# ============================================================
# ODE Engine Tests
# ============================================================

class TestODEDamageEngine:
    """ODE 損傷エンジンのテスト"""

    def test_zero_load_damage_decays(self):
        """負荷ゼロではダメージが減衰する"""
        # 高い alpha で確実にダメージを蓄積させる
        engine = ODEDamageEngine(alpha=0.1, beta=0.5, tau=2.0, m=2.0)

        # まず負荷をかけてダメージを蓄積
        D = 0.0
        for _ in range(50):
            D = engine.step(D, load=0.8)
        assert D > 0.05, f"負荷後にダメージが蓄積されるべき: got {D:.4f}"

        peak_damage = D

        # 負荷ゼロで放置 → ダメージは減衰すべき
        for _ in range(100):
            D = engine.step(D, load=0.0)

        assert D < peak_damage, "負荷ゼロでダメージが減衰すべき"
        assert D < peak_damage * 0.1, f"十分な休息後はダメージが大幅に減少すべき: got {D:.4f}"

    def test_critical_threshold(self):
        """高負荷が続くと臨界閾値を超える"""
        # 高い alpha + 低い beta で損傷が蓄積しやすいパラメータ
        engine = ODEDamageEngine(alpha=0.15, beta=0.1, tau=1.0, m=2.0, d_crit=0.8)

        D = 0.0
        exceeded = False
        for _ in range(200):
            D = engine.step(D, load=0.95)
            if engine.is_critical(D):
                exceeded = True
                break

        assert exceeded, f"高負荷が続くと臨界閾値を超えるべき: max_D={D:.4f}"

    def test_damage_stays_bounded(self):
        """ダメージ値は [0, 1] の範囲に収まる"""
        engine = ODEDamageEngine()

        D = 0.0
        for _ in range(500):
            D = engine.step(D, load=1.0)
            assert 0.0 <= D <= 1.0, f"ダメージが範囲外: {D}"

    def test_simulate_returns_correct_shape(self):
        """simulate() が正しい形状の配列を返す"""
        engine = ODEDamageEngine()
        loads = np.random.uniform(0, 1, size=100)
        damage = engine.simulate(loads)

        assert damage.shape == (100,), f"形状が不正: {damage.shape}"
        assert np.all(damage >= 0.0)
        assert np.all(damage <= 1.0)

    def test_tissue_preset(self):
        """組織プリセットが正しく読み込まれる"""
        muscle = ODEDamageEngine.from_tissue("muscle")
        tendon = ODEDamageEngine.from_tissue("tendon")

        # 筋肉は腱より修復が速い（beta が大きい）
        assert muscle.beta > tendon.beta

        with pytest.raises(ValueError):
            ODEDamageEngine.from_tissue("unknown")

    def test_risk_category(self):
        """リスクカテゴリが正しく判定される"""
        engine = ODEDamageEngine(d_crit=0.8)

        assert engine.risk_category(0.1) == "GREEN"
        assert engine.risk_category(0.5) == "YELLOW"
        assert engine.risk_category(0.65) == "ORANGE"
        assert engine.risk_category(0.85) == "RED"

    def test_nan_load_treated_as_rest(self):
        """NaN 負荷は休息として扱われる"""
        engine = ODEDamageEngine()
        loads = np.array([0.8, 0.8, np.nan, np.nan, np.nan])
        damage = engine.simulate(loads)

        # NaN 期間中はダメージが減少すべき
        assert damage[4] < damage[1], "NaN は休息として扱うべき"


# ============================================================
# EKF Engine Tests
# ============================================================

class TestEKFDecouplingEngine:
    """EKF デカップリング検出エンジンのテスト"""

    def test_honest_athlete_low_innovation(self):
        """正直な選手は innovation が小さい"""
        ekf = EKFDecouplingEngine(process_noise=0.1, measurement_noise=0.5)

        innovations: list[float] = []
        for _ in range(100):
            load = np.random.uniform(0.3, 0.7)
            # 正直な申告: sRPE ≈ load * 10 + small noise
            srpe = load * 10.0 + np.random.normal(0, 0.3)
            result = ekf.process_day(load, srpe)
            innovations.append(result["innovation"])

        # 正直な選手の innovation は小さいはず
        mean_abs_innovation = np.mean(np.abs(innovations[-50:]))
        assert mean_abs_innovation < 3.0, (
            f"正直な選手の innovation が大きすぎる: {mean_abs_innovation:.2f}"
        )

    def test_underreporter_detected(self):
        """過小申告者のデカップリングを検出する"""
        ekf = EKFDecouplingEngine(
            process_noise=0.1, measurement_noise=0.5, kappa=0.85
        )

        n_decoupled = 0
        # ウォームアップ（フィルタの安定化）
        for _ in range(30):
            load = np.random.uniform(0.3, 0.7)
            srpe = load * 10.0 + np.random.normal(0, 0.3)
            ekf.process_day(load, srpe)

        # 過小申告フェーズ: 高負荷なのに低い sRPE を申告
        for _ in range(50):
            load = np.random.uniform(0.6, 0.9)
            # 過小申告: 本来 load*10 のところ 60% しか申告しない
            srpe = load * 10.0 * 0.6 + np.random.normal(0, 0.2)
            result = ekf.process_day(load, srpe)
            if result["is_decoupled"]:
                n_decoupled += 1

        detection_rate = n_decoupled / 50
        assert detection_rate > 0.3, (
            f"過小申告の検出率が低すぎる: {detection_rate:.1%}"
        )

    def test_reset_clears_state(self):
        """reset() で状態がクリアされる"""
        ekf = EKFDecouplingEngine()

        # いくつかデータを処理
        for _ in range(20):
            ekf.process_day(0.5, 5.0)

        assert len(ekf.innovation_history) > 0

        ekf.reset()

        assert ekf.x == 0.0
        assert ekf.P == 1.0
        assert len(ekf.innovation_history) == 0
        assert len(ekf.state_history) == 0

    def test_innovation_stats(self):
        """innovation 統計が正しく計算される"""
        ekf = EKFDecouplingEngine()

        for _ in range(50):
            ekf.process_day(0.5, 5.0)

        stats = ekf.get_innovation_stats()

        assert "mean" in stats
        assert "std" in stats
        assert "decoupling_rate" in stats
        assert 0.0 <= stats["decoupling_rate"] <= 1.0


# ============================================================
# ETL Tests
# ============================================================

class TestETL:
    """ETL モジュールのテスト"""

    def test_synthetic_data_shape(self):
        """合成データが正しい形状を持つ"""
        df = generate_synthetic_dataset(n_athletes=3, n_days=30)

        assert len(df) == 3 * 30
        assert "athlete_id" in df.columns
        assert "objective_load" in df.columns
        assert "subjective_srpe" in df.columns
        assert "injury_event" in df.columns

    def test_synthetic_data_has_injuries(self):
        """合成データに怪我イベントが含まれる"""
        df = generate_synthetic_dataset(n_athletes=5, n_days=180, seed=42)
        assert df["injury_event"].sum() > 0, "怪我イベントが1つもない"

    def test_synthetic_data_has_missing(self):
        """合成データに欠損値が含まれる"""
        df = generate_synthetic_dataset(n_athletes=5, n_days=180, seed=42)
        missing_rate = df["objective_load"].isna().mean()
        assert 0.01 < missing_rate < 0.15, (
            f"欠損率が想定範囲外: {missing_rate:.1%}"
        )

    def test_preprocess_handles_missing(self):
        """前処理が欠損値を適切に補完する"""
        df = generate_synthetic_dataset(n_athletes=3, n_days=60)
        processed = preprocess_sports_data(df)

        # 前処理後は欠損なし
        assert processed["objective_load"].isna().sum() == 0
        assert processed["subjective_srpe"].isna().sum() == 0

    def test_preprocess_adds_zscore(self):
        """前処理が Z スコアカラムを追加する"""
        df = generate_synthetic_dataset(n_athletes=3, n_days=60)
        processed = preprocess_sports_data(df)

        assert "objective_load_zscore" in processed.columns
        assert "subjective_srpe_zscore" in processed.columns

    def test_preprocess_clips_outliers(self):
        """前処理が外れ値をクリップする"""
        df = generate_synthetic_dataset(n_athletes=2, n_days=30)
        processed = preprocess_sports_data(df)

        assert processed["objective_load"].max() <= 1.0
        assert processed["objective_load"].min() >= 0.0
        assert processed["subjective_srpe"].max() <= 10.0
        assert processed["subjective_srpe"].min() >= 0.5

    def test_has_underreporters(self):
        """合成データに過小申告者が含まれる（確率的）"""
        df = generate_synthetic_dataset(n_athletes=10, n_days=30, seed=42)
        n_underreporters = df.groupby("athlete_id")["is_underreporter"].first().sum()
        # 10人中少なくとも1人は過小申告者（確率的に）
        assert n_underreporters >= 1, "過小申告者が1人もいない"


# ============================================================
# Evaluator Tests
# ============================================================

class TestEvaluator:
    """評価モジュールのテスト"""

    def _make_dummy_results(self) -> pd.DataFrame:
        """テスト用のダミー結果を生成"""
        n = 100
        dates = pd.date_range("2025-07-01", periods=n)
        return pd.DataFrame({
            "date": dates,
            "athlete_id": "ATH-001",
            "damage": np.random.uniform(0, 1, n),
            "risk_category": np.random.choice(
                ["GREEN", "YELLOW", "ORANGE", "RED"], n
            ),
            "injury_event": np.random.choice([0, 0, 0, 0, 0, 1], n),
            "is_decoupled": np.random.choice([False, False, True], n),
            "is_underreporter": False,
        })

    def test_evaluate_returns_valid_metrics(self):
        """評価関数が有効な指標を返す"""
        df = self._make_dummy_results()
        evaluation = evaluate_backtest(df, lookahead_days=3)

        assert "roc_auc" in evaluation
        assert "precision" in evaluation
        assert "recall" in evaluation
        assert "f1" in evaluation
        assert "confusion_matrix" in evaluation

        assert 0.0 <= evaluation["roc_auc"] <= 1.0
        assert 0.0 <= evaluation["precision"] <= 1.0
        assert 0.0 <= evaluation["recall"] <= 1.0
        assert 0.0 <= evaluation["f1"] <= 1.0

    def test_roc_auc_perfect_predictor(self):
        """完全な予測器の ROC-AUC は 1.0 に近い"""
        y_true = np.array([0, 0, 0, 0, 1, 1, 1, 1])
        y_score = np.array([0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9])
        auc = _compute_roc_auc(y_true, y_score)
        assert auc >= 0.95, f"完全予測器の AUC が低すぎる: {auc:.3f}"

    def test_roc_auc_random_predictor(self):
        """ランダム予測器の ROC-AUC は 0.5 付近"""
        rng = np.random.default_rng(42)
        y_true = rng.choice([0, 1], size=1000)
        y_score = rng.uniform(0, 1, size=1000)
        auc = _compute_roc_auc(y_true, y_score)
        assert 0.4 <= auc <= 0.6, f"ランダム予測器の AUC が異常: {auc:.3f}"

    def test_per_athlete_stats(self):
        """選手別統計が含まれる"""
        df = self._make_dummy_results()
        evaluation = evaluate_backtest(df)

        assert "per_athlete" in evaluation
        assert len(evaluation["per_athlete"]) == 1  # 1選手
        assert evaluation["per_athlete"][0]["athlete_id"] == "ATH-001"


# ============================================================
# Integration Test
# ============================================================

class TestIntegration:
    """統合テスト: パイプライン全体の動作確認"""

    def test_end_to_end_pipeline(self):
        """ETL → ODE → EKF → 評価 の一連の流れが動く"""
        # 小規模データで全パイプラインを実行
        raw_df = generate_synthetic_dataset(n_athletes=2, n_days=60, seed=99)
        df = preprocess_sports_data(raw_df)

        ode = ODEDamageEngine()
        ekf = EKFDecouplingEngine()

        results: list[dict] = []
        for athlete_id in df["athlete_id"].unique():
            adf = df[df["athlete_id"] == athlete_id].sort_values("date")
            ekf.reset()
            damage_series = ode.simulate(adf["objective_load"].values)

            for i, (_, row) in enumerate(adf.iterrows()):
                ekf_result = ekf.process_day(
                    row["objective_load"], row["subjective_srpe"]
                )
                results.append({
                    "date": row["date"],
                    "athlete_id": athlete_id,
                    "damage": damage_series[i],
                    "risk_category": ode.risk_category(damage_series[i]),
                    "injury_event": row["injury_event"],
                    "is_decoupled": ekf_result["is_decoupled"],
                    "is_underreporter": row.get("is_underreporter", False),
                })

        results_df = pd.DataFrame(results)
        evaluation = evaluate_backtest(results_df, lookahead_days=3)

        # 基本的な健全性チェック
        assert evaluation["n_athletes"] == 2
        assert evaluation["n_days_total"] == 120
        assert 0.0 <= evaluation["roc_auc"] <= 1.0
        assert len(evaluation["per_athlete"]) == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
