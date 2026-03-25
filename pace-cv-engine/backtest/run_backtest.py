#!/usr/bin/env python3
"""
PACE v6.0 バックテスト・パイプライン
コールドスタート問題の解決 + 投資家向け精度検証レポート生成

合成データで ODE 損傷モデルと EKF デカップリング検出の精度を検証する。

使い方:
  python run_backtest.py [--athletes 5] [--days 180] [--output results/]

出力:
  - コンソール: サマリー統計 + レポート
  - results/backtest_results.csv: 全データポイントの結果
  - results/backtest_report.txt: テキストレポート
  - results/backtest_evaluation.json: 評価指標（JSON）
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# 同一パッケージからのインポート
from etl import generate_synthetic_dataset, preprocess_sports_data
from ode_engine import ODEDamageEngine
from ekf_engine import EKFDecouplingEngine
from evaluator import evaluate_backtest, generate_report


def run_pipeline(
    n_athletes: int = 5,
    n_days: int = 180,
    output_dir: str = "results",
    seed: int = 42,
) -> dict:
    """
    バックテストパイプラインの実行

    1. 合成データ生成
    2. 前処理
    3. 選手ごとに ODE + EKF 実行
    4. 結果を DataFrame に集約
    5. バックテスト評価
    6. レポート出力

    Args:
        n_athletes: 選手数
        n_days: シミュレーション日数
        output_dir: 出力ディレクトリ
        seed: 乱数シード

    Returns:
        評価指標の辞書
    """
    print("=" * 60)
    print("  PACE v6.0 バックテスト・パイプライン")
    print("=" * 60)
    print()

    # --- Step 1: 合成データ生成 ---
    print("[1/6] 合成データ生成中...")
    raw_df = generate_synthetic_dataset(
        n_athletes=n_athletes,
        n_days=n_days,
        seed=seed,
    )
    print(f"  生成完了: {len(raw_df)} レコード "
          f"({n_athletes} 選手 x {n_days} 日)")
    print(f"  怪我イベント: {raw_df['injury_event'].sum()} 件")
    print(f"  欠損率: {raw_df['objective_load'].isna().mean():.1%}")
    print()

    # --- Step 2: 前処理 ---
    print("[2/6] データ前処理中...")
    df = preprocess_sports_data(raw_df)
    print(f"  前処理完了: 欠損値補完、外れ値処理、Z正規化")
    print()

    # --- Step 3: 選手ごとに ODE + EKF 実行 ---
    print("[3/6] ODE損傷モデル + EKFデカップリング検出 実行中...")

    ode_engine = ODEDamageEngine(
        alpha=0.01, beta=0.5, tau=2.0, m=2.0, d_crit=0.8
    )
    ekf_engine = EKFDecouplingEngine(
        process_noise=0.1, measurement_noise=0.5, kappa=0.85
    )

    all_results: list[dict] = []

    for athlete_id in sorted(df["athlete_id"].unique()):
        athlete_df = df[df["athlete_id"] == athlete_id].copy()
        athlete_df = athlete_df.sort_values("date").reset_index(drop=True)

        # エンジンのリセット（選手ごとに独立）
        ekf_engine.reset()

        # 負荷時系列を取得
        loads = athlete_df["objective_load"].values

        # ODE シミュレーション
        damage_series = ode_engine.simulate(loads)

        for i, (_, row) in enumerate(athlete_df.iterrows()):
            load = row["objective_load"]
            srpe = row["subjective_srpe"]
            damage = damage_series[i]

            # EKF デカップリング検出
            ekf_result = ekf_engine.process_day(
                objective_load=load,
                srpe=srpe,
            )

            # リスクカテゴリ判定
            risk_cat = ode_engine.risk_category(damage)

            all_results.append({
                "date": row["date"],
                "athlete_id": athlete_id,
                "objective_load": load,
                "subjective_srpe": srpe,
                "injury_event": row["injury_event"],
                "phase": row.get("phase", "unknown"),
                "is_underreporter": row.get("is_underreporter", False),
                "damage": damage,
                "risk_category": risk_cat,
                "ekf_state": ekf_result["predicted_state"],
                "innovation": ekf_result["innovation"],
                "is_decoupled": ekf_result["is_decoupled"],
                "decoupling_type": ekf_result["decoupling_type"],
                "kalman_gain": ekf_result["kalman_gain"],
            })

        # 選手別の中間サマリー
        ekf_stats = ekf_engine.get_innovation_stats()
        athlete_injuries = athlete_df["injury_event"].sum()
        is_ur = athlete_df["is_underreporter"].iloc[0]
        reporter_str = "過小申告者" if is_ur else "正常申告者"
        print(
            f"  {athlete_id} ({reporter_str}): "
            f"怪我={athlete_injuries}, "
            f"max_damage={damage_series.max():.3f}, "
            f"デカップリング率={ekf_stats['decoupling_rate']:.1%}"
        )

    print()

    # --- Step 4: 結果を DataFrame に集約 ---
    print("[4/6] 結果集約中...")
    results_df = pd.DataFrame(all_results)
    print(f"  総レコード: {len(results_df)}")
    print()

    # --- Step 5: バックテスト評価 ---
    print("[5/6] バックテスト評価中...")
    evaluation = evaluate_backtest(
        results_df,
        lookahead_days=3,
        damage_threshold=0.6,
    )

    # 主要指標の表示
    print(f"  ROC-AUC:   {evaluation['roc_auc']:.4f}")
    print(f"  Precision: {evaluation['precision']:.4f}")
    print(f"  Recall:    {evaluation['recall']:.4f}")
    print(f"  F1 Score:  {evaluation['f1']:.4f}")
    cm = evaluation["confusion_matrix"]
    print(f"  混同行列:  TP={cm['tp']}, FP={cm['fp']}, "
          f"FN={cm['fn']}, TN={cm['tn']}")
    print()

    # --- Step 6: レポート出力 ---
    print("[6/6] レポート出力中...")

    # 出力ディレクトリの作成
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    # CSV 出力
    csv_path = out_path / "backtest_results.csv"
    results_df.to_csv(csv_path, index=False)
    print(f"  CSV: {csv_path}")

    # テキストレポート
    report_text = generate_report(results_df, evaluation)
    report_path = out_path / "backtest_report.txt"
    report_path.write_text(report_text, encoding="utf-8")
    print(f"  レポート: {report_path}")

    # JSON 評価指標
    eval_json = {
        k: v for k, v in evaluation.items()
        if k != "per_athlete"  # per_athlete は CSV で別途出力
    }
    eval_json_path = out_path / "backtest_evaluation.json"
    eval_json_path.write_text(
        json.dumps(eval_json, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"  評価JSON: {eval_json_path}")

    # 選手別統計 CSV
    athlete_stats_df = pd.DataFrame(evaluation["per_athlete"])
    athlete_csv_path = out_path / "athlete_stats.csv"
    athlete_stats_df.to_csv(athlete_csv_path, index=False)
    print(f"  選手別CSV: {athlete_csv_path}")

    print()

    # レポートをコンソールにも出力
    print(report_text)

    return evaluation


def parse_args() -> argparse.Namespace:
    """コマンドライン引数のパース"""
    parser = argparse.ArgumentParser(
        description="PACE v6.0 バックテスト・パイプライン",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
例:
  python run_backtest.py
  python run_backtest.py --athletes 10 --days 365
  python run_backtest.py --output my_results/ --seed 123
        """,
    )
    parser.add_argument(
        "--athletes", type=int, default=5,
        help="シミュレーション選手数 (default: 5)",
    )
    parser.add_argument(
        "--days", type=int, default=180,
        help="シミュレーション日数 (default: 180)",
    )
    parser.add_argument(
        "--output", type=str, default="results",
        help="出力ディレクトリ (default: results/)",
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="乱数シード (default: 42)",
    )
    return parser.parse_args()


def main() -> None:
    """メインエントリーポイント"""
    args = parse_args()

    evaluation = run_pipeline(
        n_athletes=args.athletes,
        n_days=args.days,
        output_dir=args.output,
        seed=args.seed,
    )

    # 終了コード: ROC-AUC が 0.5 以下なら失敗
    if evaluation["roc_auc"] <= 0.5:
        print("\n[WARNING] ROC-AUC がランダム以下です。モデル調整が必要です。")
        sys.exit(1)


if __name__ == "__main__":
    main()
