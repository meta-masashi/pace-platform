"""
PACE v6.0 ETL (Extract-Transform-Load) モジュール

合成データ生成とデータ前処理を提供する。
スポーツ科学の現実的なパターン（期分け・怪我相関・申告バイアス）を再現。
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def generate_synthetic_dataset(
    n_athletes: int = 5,
    n_days: int = 180,
    seed: int = 42,
) -> pd.DataFrame:
    """
    現実的な合成スポーツ科学データを生成する。

    特徴:
    - 期分け（base → build → peak → recovery）に基づく負荷パターン
    - sRPE は客観負荷と相関するがノイズを含む
    - 累積負荷が高く回復が不十分な場合に怪我確率が上昇
    - 一部の選手は sRPE を過小申告する（デカップリング）
    - 約5%のランダム欠損

    Args:
        n_athletes: 選手数
        n_days: シミュレーション日数
        seed: 乱数シード

    Returns:
        DataFrame with columns:
            date, athlete_id, objective_load, subjective_srpe,
            injury_event, phase, is_underreporter
    """
    rng = np.random.default_rng(seed)
    records: list[dict] = []

    # 期分けサイクル定義（日数）
    # base(40d) → build(50d) → peak(30d) → recovery(14d) → repeat
    cycle_phases = [
        ("base", 40, 0.4, 0.15),      # (名前, 日数, 負荷レベル, 負荷変動)
        ("build", 50, 0.65, 0.20),
        ("peak", 30, 0.85, 0.10),
        ("recovery", 14, 0.25, 0.10),
    ]
    total_cycle = sum(p[1] for p in cycle_phases)

    for athlete_idx in range(n_athletes):
        athlete_id = f"ATH-{athlete_idx + 1:03d}"

        # 選手特性: 一部が過小申告者
        # 約30%の確率で過小申告バイアスを持つ
        is_underreporter = rng.random() < 0.3
        underreport_factor = rng.uniform(0.6, 0.8) if is_underreporter else 1.0

        # 個体差パラメータ
        athlete_base_fitness = rng.uniform(0.8, 1.2)  # 体力のベースライン
        injury_susceptibility = rng.uniform(0.8, 1.5)  # 怪我しやすさ

        cumulative_load = 0.0
        days_since_rest = 0
        start_date = pd.Timestamp("2025-07-01")

        for day in range(n_days):
            date = start_date + pd.Timedelta(days=day)

            # 期分けフェーズを特定
            day_in_cycle = day % total_cycle
            cumul = 0
            phase_name = "base"
            phase_load_level = 0.4
            phase_variability = 0.15
            for pname, pdur, plevel, pvar in cycle_phases:
                cumul += pdur
                if day_in_cycle < cumul:
                    phase_name = pname
                    phase_load_level = plevel
                    phase_variability = pvar
                    break

            # 客観的負荷（GPS由来、0〜1スケール）
            objective_load = np.clip(
                phase_load_level * athlete_base_fitness
                + rng.normal(0, phase_variability),
                0.0,
                1.0,
            )

            # 休息日（週1回程度）
            if day % 7 == 6:  # 日曜休み
                objective_load *= 0.15
                days_since_rest = 0
            else:
                days_since_rest += 1

            # 累積負荷の更新（指数移動平均的）
            cumulative_load = 0.85 * cumulative_load + objective_load

            # 主観的 sRPE（客観負荷と相関 + ノイズ + バイアス）
            # 正常: sRPE ≈ objective_load * 10 (RPE 1-10 スケール)
            base_srpe = objective_load * 10.0
            noise = rng.normal(0, 0.8)
            srpe = base_srpe + noise

            # 過小申告バイアスの適用
            if is_underreporter and phase_name in ("build", "peak"):
                # build/peak フェーズでのみ過小申告が顕著になる
                srpe *= underreport_factor

            srpe = np.clip(srpe, 0.5, 10.0)

            # 怪我イベントの確率計算
            # 高累積負荷 + 少ない休息 + 個体感受性 → 怪我確率上昇
            injury_prob = (
                0.002  # ベースライン（1日あたり0.2%）
                + 0.015 * max(0, cumulative_load - 3.0)  # 累積負荷超過
                + 0.005 * max(0, days_since_rest - 5)     # 連続練習
            ) * injury_susceptibility

            # peak フェーズは特にリスク高い
            if phase_name == "peak":
                injury_prob *= 1.5

            injury_prob = np.clip(injury_prob, 0.0, 0.15)
            injury_event = int(rng.random() < injury_prob)

            # 怪我後は累積負荷リセット（休養に入るため）
            if injury_event:
                cumulative_load *= 0.3
                days_since_rest = 0

            # ランダム欠損（約5%）
            if rng.random() < 0.05:
                objective_load = np.nan
                srpe = np.nan

            records.append(
                {
                    "date": date,
                    "athlete_id": athlete_id,
                    "objective_load": objective_load,
                    "subjective_srpe": srpe,
                    "injury_event": injury_event,
                    "phase": phase_name,
                    "is_underreporter": is_underreporter,
                }
            )

    df = pd.DataFrame(records)
    return df


def preprocess_sports_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    スポーツデータを PACE 標準スキーマに前処理する。

    処理内容:
    1. 欠損値の前方補完（forward fill）
    2. 外れ値の検出とキャッピング（生理学的上限）
    3. 選手ごとの Z スコア正規化

    Args:
        df: 生データ DataFrame

    Returns:
        前処理済み DataFrame（正規化カラム追加）
    """
    df = df.copy()
    df = df.sort_values(["athlete_id", "date"]).reset_index(drop=True)

    # --- 1. 欠損値の前方補完 ---
    # 選手ごとに forward fill（最大3日まで）
    for col in ["objective_load", "subjective_srpe"]:
        df[col] = df.groupby("athlete_id")[col].ffill(limit=3)

    # ffill で埋まらなかった残りは後方補完
    for col in ["objective_load", "subjective_srpe"]:
        df[col] = df.groupby("athlete_id")[col].bfill(limit=3)

    # それでも残る欠損はグループ中央値で補完
    for col in ["objective_load", "subjective_srpe"]:
        group_medians = df.groupby("athlete_id")[col].transform("median")
        df[col] = df[col].fillna(group_medians)

    # --- 2. 外れ値検出とキャッピング（生理学的上限） ---
    # objective_load: 0〜1 のスケール
    df["objective_load"] = df["objective_load"].clip(0.0, 1.0)

    # sRPE: 0.5〜10.0 のスケール
    df["subjective_srpe"] = df["subjective_srpe"].clip(0.5, 10.0)

    # injury_event: 0 or 1
    df["injury_event"] = df["injury_event"].fillna(0).astype(int)

    # --- 3. Z スコア正規化（選手ごと） ---
    for col in ["objective_load", "subjective_srpe"]:
        group_mean = df.groupby("athlete_id")[col].transform("mean")
        group_std = df.groupby("athlete_id")[col].transform("std")
        # std=0 の場合は 0 で埋める
        z_col = f"{col}_zscore"
        df[z_col] = np.where(
            group_std > 1e-8,
            (df[col] - group_mean) / group_std,
            0.0,
        )

    return df
