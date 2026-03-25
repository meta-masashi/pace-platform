"""
PACE v6.0 バックテスト評価モジュール

ODE/EKF エンジンの出力を評価し、
怪我予測の精度指標とレポートを生成する。
"""

from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd


def evaluate_backtest(
    results_df: pd.DataFrame,
    lookahead_days: int = 3,
    damage_threshold: float = 0.6,
) -> dict:
    """
    バックテスト評価

    怪我発生日の N日前に RED/ORANGE フラグが立っていたかを評価する。
    「もしこのシステムを使っていたら、事前に警告できたか？」を検証。

    Args:
        results_df: バックテスト結果 DataFrame
            必須カラム: athlete_id, date, damage, risk_category,
                       injury_event, is_decoupled
        lookahead_days: 予測ホライズン（何日前に検出できたかを評価）
        damage_threshold: 高リスク判定の損傷閾値

    Returns:
        評価指標の辞書:
            roc_auc, precision, recall, f1,
            confusion_matrix, per_athlete_stats
    """
    df = results_df.copy()
    df = df.sort_values(["athlete_id", "date"]).reset_index(drop=True)

    # --- 予測ラベルの生成 ---
    # damage >= threshold OR デカップリング検出 → 高リスク予測
    df["predicted_risk"] = (
        (df["damage"] >= damage_threshold) | df["is_decoupled"]
    ).astype(int)

    # --- 実績ラベルの生成 ---
    # 「N日以内に怪我が発生する」かどうかの正解ラベル
    df["actual_injury_ahead"] = 0
    for athlete_id in df["athlete_id"].unique():
        athlete_idx = df.index[df["athlete_id"] == athlete_id]
        athlete_dates = df.loc[athlete_idx, "date"].values
        injury_dates = df.loc[
            (df["athlete_id"] == athlete_id) & (df["injury_event"] == 1),
            "date",
        ].values

        for injury_date in injury_dates:
            # 怪我日の前 lookahead_days 日間を positive とする
            window_start = injury_date - np.timedelta64(lookahead_days, "D")
            in_window = (athlete_dates >= window_start) & (athlete_dates <= injury_date)
            target_idx = athlete_idx[in_window]
            df.loc[target_idx, "actual_injury_ahead"] = 1

    # --- 混同行列の計算 ---
    y_true = df["actual_injury_ahead"].values
    y_pred = df["predicted_risk"].values

    tp = int(np.sum((y_pred == 1) & (y_true == 1)))
    fp = int(np.sum((y_pred == 1) & (y_true == 0)))
    fn = int(np.sum((y_pred == 0) & (y_true == 1)))
    tn = int(np.sum((y_pred == 0) & (y_true == 0)))

    # --- 精度指標 ---
    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-8)
    accuracy = (tp + tn) / max(tp + fp + fn + tn, 1)

    # --- ROC-AUC（damage を連続スコアとして使用） ---
    roc_auc = _compute_roc_auc(y_true, df["damage"].values)

    # --- 選手別統計 ---
    per_athlete: list[dict] = []
    for athlete_id in sorted(df["athlete_id"].unique()):
        adf = df[df["athlete_id"] == athlete_id]
        n_injuries = int(adf["injury_event"].sum())
        n_alerts = int(adf["predicted_risk"].sum())
        n_decoupled = int(adf["is_decoupled"].sum())

        # この選手の怪我のうち、事前に検出できた割合
        a_true = adf["actual_injury_ahead"].values
        a_pred = adf["predicted_risk"].values
        a_tp = int(np.sum((a_pred == 1) & (a_true == 1)))
        a_fn = int(np.sum((a_pred == 0) & (a_true == 1)))
        detection_rate = a_tp / max(a_tp + a_fn, 1)

        per_athlete.append({
            "athlete_id": athlete_id,
            "n_days": len(adf),
            "n_injuries": n_injuries,
            "n_alerts": n_alerts,
            "n_decoupled": n_decoupled,
            "detection_rate": detection_rate,
            "mean_damage": float(adf["damage"].mean()),
            "max_damage": float(adf["damage"].max()),
            "is_underreporter": bool(
                adf["is_underreporter"].iloc[0]
                if "is_underreporter" in adf.columns
                else False
            ),
        })

    return {
        "roc_auc": roc_auc,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "accuracy": accuracy,
        "confusion_matrix": {
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        },
        "total_injuries": int(df["injury_event"].sum()),
        "total_alerts": int(df["predicted_risk"].sum()),
        "lookahead_days": lookahead_days,
        "damage_threshold": damage_threshold,
        "n_athletes": df["athlete_id"].nunique(),
        "n_days_total": len(df),
        "per_athlete": per_athlete,
    }


def _compute_roc_auc(y_true: np.ndarray, y_score: np.ndarray) -> float:
    """
    ROC-AUC を計算（scikit-learn 不要の簡易実装）

    台形近似で AUC を計算する。

    Args:
        y_true: バイナリの正解ラベル
        y_score: 連続的な予測スコア

    Returns:
        ROC-AUC スコア [0, 1]
    """
    # NaN を除外
    valid = ~np.isnan(y_score)
    y_true = y_true[valid]
    y_score = y_score[valid]

    if len(y_true) == 0 or y_true.sum() == 0 or y_true.sum() == len(y_true):
        return 0.5  # 計算不能な場合は 0.5

    # スコアの降順にソート
    desc_idx = np.argsort(-y_score)
    y_true_sorted = y_true[desc_idx]

    # TPR と FPR を計算
    n_pos = y_true.sum()
    n_neg = len(y_true) - n_pos

    tpr_points = [0.0]
    fpr_points = [0.0]
    tp_count = 0
    fp_count = 0

    for label in y_true_sorted:
        if label == 1:
            tp_count += 1
        else:
            fp_count += 1
        tpr_points.append(tp_count / n_pos)
        fpr_points.append(fp_count / n_neg)

    # 台形近似で AUC 計算
    auc = 0.0
    for i in range(1, len(fpr_points)):
        auc += (fpr_points[i] - fpr_points[i - 1]) * (
            tpr_points[i] + tpr_points[i - 1]
        ) / 2.0

    return float(auc)


def generate_report(results_df: pd.DataFrame, evaluation: dict) -> str:
    """
    テキストベースのバックテストレポートを生成（日本語）

    投資家向けの精度検証レポートとして使用可能な形式。

    Args:
        results_df: バックテスト結果 DataFrame
        evaluation: evaluate_backtest() の返り値

    Returns:
        フォーマット済みのレポート文字列
    """
    cm = evaluation["confusion_matrix"]
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines: list[str] = []
    lines.append("=" * 70)
    lines.append("  PACE v6.0 バックテスト精度検証レポート")
    lines.append(f"  生成日時: {timestamp}")
    lines.append("=" * 70)
    lines.append("")

    # --- サマリー ---
    lines.append("■ サマリー")
    lines.append("-" * 40)
    lines.append(f"  対象選手数:         {evaluation['n_athletes']}")
    lines.append(f"  総データポイント:   {evaluation['n_days_total']}")
    lines.append(f"  総怪我イベント:     {evaluation['total_injuries']}")
    lines.append(f"  総アラート発報:     {evaluation['total_alerts']}")
    lines.append(f"  予測ホライズン:     {evaluation['lookahead_days']}日前")
    lines.append(f"  損傷閾値:           {evaluation['damage_threshold']}")
    lines.append("")

    # --- 精度指標 ---
    lines.append("■ 精度指標")
    lines.append("-" * 40)
    lines.append(f"  ROC-AUC:    {evaluation['roc_auc']:.4f}")
    lines.append(f"  Precision:  {evaluation['precision']:.4f}  "
                 f"(アラートのうち実際に怪我に至った割合)")
    lines.append(f"  Recall:     {evaluation['recall']:.4f}  "
                 f"(怪我のうち事前にアラートできた割合)")
    lines.append(f"  F1 Score:   {evaluation['f1']:.4f}")
    lines.append(f"  Accuracy:   {evaluation['accuracy']:.4f}")
    lines.append("")

    # --- 混同行列 ---
    lines.append("■ 混同行列")
    lines.append("-" * 40)
    lines.append("                    予測")
    lines.append("                 高リスク  低リスク")
    lines.append(f"  実際 怪我あり   {cm['tp']:6d}    {cm['fn']:6d}")
    lines.append(f"       怪我なし   {cm['fp']:6d}    {cm['tn']:6d}")
    lines.append("")

    # --- 選手別内訳 ---
    lines.append("■ 選手別内訳")
    lines.append("-" * 70)
    lines.append(
        f"  {'選手ID':<10s}  {'怪我':<5s}  {'アラート':<8s}  "
        f"{'検出率':<8s}  {'平均損傷':<8s}  {'最大損傷':<8s}  {'申告タイプ'}"
    )
    lines.append("  " + "-" * 65)

    for athlete in evaluation["per_athlete"]:
        reporter_type = "過小申告" if athlete["is_underreporter"] else "正常申告"
        lines.append(
            f"  {athlete['athlete_id']:<10s}  "
            f"{athlete['n_injuries']:<5d}  "
            f"{athlete['n_alerts']:<8d}  "
            f"{athlete['detection_rate']:<8.1%}  "
            f"{athlete['mean_damage']:<8.3f}  "
            f"{athlete['max_damage']:<8.3f}  "
            f"{reporter_type}"
        )
    lines.append("")

    # --- 解釈 ---
    lines.append("■ 結果の解釈")
    lines.append("-" * 40)

    auc = evaluation["roc_auc"]
    if auc >= 0.8:
        auc_interp = "優秀（臨床的に有用な予測精度）"
    elif auc >= 0.7:
        auc_interp = "良好（実用的な予測精度）"
    elif auc >= 0.6:
        auc_interp = "中程度（改善の余地あり）"
    else:
        auc_interp = "要改善（ランダム予測に近い）"

    lines.append(f"  ROC-AUC {auc:.3f}: {auc_interp}")
    lines.append("")

    recall = evaluation["recall"]
    if recall >= 0.8:
        lines.append("  高い Recall: 大部分の怪我を事前に検出可能")
    elif recall >= 0.6:
        lines.append("  中程度の Recall: 多くの怪我を検出できるが見逃しもある")
    else:
        lines.append("  低い Recall: 見逃しが多く、モデル改善が必要")

    precision = evaluation["precision"]
    if precision < 0.3:
        lines.append("  低い Precision: 偽アラートが多い → 現場の信頼低下リスク")
    elif precision < 0.5:
        lines.append("  中程度の Precision: 一定の偽アラートあり")
    else:
        lines.append("  高い Precision: アラートの信頼性が高い")

    lines.append("")
    lines.append("■ 推奨アクション")
    lines.append("-" * 40)
    lines.append("  1. パイロットチームでの前向き検証を推奨")
    lines.append("  2. Bayesian オンライン学習による精度向上の余地あり")
    lines.append("  3. 組織タイプ別パラメータの個別最適化を検討")
    lines.append("")
    lines.append("=" * 70)
    lines.append("  End of Report")
    lines.append("=" * 70)

    return "\n".join(lines)
