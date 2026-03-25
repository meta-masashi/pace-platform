"""PACE バイオメカニクスエンジン — 損傷リモデリングODEソルバー.

Sprint 2 (Tasks #7-11): 組織損傷の経時変化を常微分方程式で表現し、
scipy.integrate.solve_ivp (RK45) を用いて数値的に解く。

基本方程式:
    dD/dt = alpha * Load(t)^m - beta * D(t) * exp(-tau * D(t))

物理的解釈:
  - 第1項: 負荷による損傷生成（m > 1 で非線形、高負荷ほど不均衡に損傷が増大）
  - 第2項: 生体修復機構（低損傷時は損傷に比例して修復、高損傷時はGAS疲弊で修復能低下）
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq


# ─────────────────────────────────────────────────────────────────────
# 定数
# ─────────────────────────────────────────────────────────────────────

_DAMAGE_FLOOR: float = 0.0
"""損傷値の下限（負の損傷は物理的に無意味）"""

_DAMAGE_CEILING: float = 100.0
"""損傷値の上限（数値安定性のためのクランプ）"""

_EXP_CLIP: float = 500.0
"""exp引数の上限（オーバーフロー防止）"""


# ─────────────────────────────────────────────────────────────────────
# ODE 関数
# ─────────────────────────────────────────────────────────────────────

def damage_remodeling_ode(
    t: float,
    D: float,
    load: float,
    alpha: float,
    beta: float,
    tau: float,
    m: float,
) -> float:
    """損傷リモデリングODEの右辺を計算する.

    Args:
        t: 時刻（solve_ivp互換、本実装では未使用）
        D: 現在の損傷レベル
        load: トレーニング負荷（定数入力）
        alpha: 損傷生成係数
        beta: 修復速度係数
        tau: 修復飽和因子
        m: 負荷指数（>1 で非線形）

    Returns:
        dD/dt: 損傷変化率
    """
    # 損傷を非負に制約（numpy配列要素のスカラー変換）
    D_val = D.item() if hasattr(D, "item") else float(D)
    D_clamped = max(D_val, _DAMAGE_FLOOR)

    # 損傷生成項: alpha * Load^m
    if load <= 0.0:
        damage_generation = 0.0
    else:
        # オーバーフロー防止: log(load) * m が大きすぎる場合をクランプ
        log_load = math.log(load) if load > 0.0 else 0.0
        if log_load * m > _EXP_CLIP:
            damage_generation = alpha * math.exp(_EXP_CLIP)
        else:
            damage_generation = alpha * (load ** m)

    # 修復項: beta * D * exp(-tau * D)
    exponent = -tau * D_clamped
    if exponent < -_EXP_CLIP:
        # exp(-tau*D) → 0: 修復能がほぼゼロ（GAS疲弊フェーズ）
        repair = 0.0
    else:
        repair = beta * D_clamped * math.exp(exponent)

    return damage_generation - repair


# ─────────────────────────────────────────────────────────────────────
# ODE ソルバー
# ─────────────────────────────────────────────────────────────────────

def simulate_damage(
    current_damage: float,
    load: float,
    delta_t: float,
    alpha: float,
    beta: float,
    tau: float,
    m: float,
    n_steps: int = 100,
) -> dict[str, Any]:
    """損傷リモデリングODEを数値的に解く.

    scipy.integrate.solve_ivp (RK45 陽的ルンゲ=クッタ法) を使用して
    指定された時間ステップ分の損傷変化をシミュレーションする。

    Args:
        current_damage: 初期損傷レベル D(t-1)
        load: トレーニング負荷（シミュレーション期間中一定）
        delta_t: 時間ステップ（日単位）
        alpha: 損傷生成係数
        beta: 修復速度係数
        tau: 修復飽和因子
        m: 負荷指数
        n_steps: 出力時系列のポイント数

    Returns:
        シミュレーション結果を含む辞書:
          - damage_after: 最終損傷レベル
          - repair_rate: 最終時点での修復速度
          - simulation_points: 時系列データ [{t, damage, repair_rate}]
    """
    # 初期値を非負に制約
    D0 = max(current_damage, _DAMAGE_FLOOR)

    # 評価時点の配列
    t_eval = np.linspace(0.0, delta_t, n_steps)

    # solve_ivp で数値積分
    sol = solve_ivp(
        fun=lambda t, D: damage_remodeling_ode(t, D, load, alpha, beta, tau, m),
        t_span=(0.0, delta_t),
        y0=[D0],
        method="RK45",
        t_eval=t_eval,
        rtol=1e-8,
        atol=1e-10,
        max_step=delta_t / 10.0,
    )

    if not sol.success:
        # フォールバック: オイラー法で近似
        damage_after = D0 + damage_remodeling_ode(0.0, D0, load, alpha, beta, tau, m) * delta_t
        damage_after = max(damage_after, _DAMAGE_FLOOR)
        damage_after = min(damage_after, _DAMAGE_CEILING)
        repair_rate = _compute_repair_rate(damage_after, beta, tau)
        return {
            "damage_after": damage_after,
            "repair_rate": repair_rate,
            "simulation_points": [
                {"t": 0.0, "damage": D0, "repair_rate": _compute_repair_rate(D0, beta, tau)},
                {"t": delta_t, "damage": damage_after, "repair_rate": repair_rate},
            ],
        }

    # 結果を取得
    damages = sol.y[0]

    # 損傷値を非負にクランプ
    damages = np.clip(damages, _DAMAGE_FLOOR, _DAMAGE_CEILING)

    # 時系列データを構築
    simulation_points: list[dict[str, float]] = []
    for i, (t_val, d_val) in enumerate(zip(sol.t, damages)):
        rr = _compute_repair_rate(float(d_val), beta, tau)
        simulation_points.append({
            "t": round(float(t_val), 6),
            "damage": round(float(d_val), 8),
            "repair_rate": round(rr, 8),
        })

    damage_after = float(damages[-1])
    repair_rate = _compute_repair_rate(damage_after, beta, tau)

    return {
        "damage_after": damage_after,
        "repair_rate": repair_rate,
        "simulation_points": simulation_points,
    }


# ─────────────────────────────────────────────────────────────────────
# 臨界損傷閾値の計算
# ─────────────────────────────────────────────────────────────────────

def calculate_d_crit(
    alpha: float,
    beta: float,
    tau: float,
    m: float,
    load: float = 1.0,
) -> float:
    """修復速度と損傷生成速度が均衡する臨界損傷閾値 D_crit を計算する.

    定常状態条件:
        alpha * Load^m = beta * D_crit * exp(-tau * D_crit)

    修復関数 f(D) = beta * D * exp(-tau * D) は D = 1/tau で最大値をとる。
    負荷が修復最大値を超える場合、D_critは存在しない（修復不能）。

    Args:
        alpha: 損傷生成係数
        beta: 修復速度係数
        tau: 修復飽和因子
        m: 負荷指数
        load: 参照負荷（デフォルト: 1.0）

    Returns:
        臨界損傷閾値 D_crit。
        修復最大値を超える場合は 1/tau を返す（最大修復点）。
    """
    if load <= 0.0:
        # 負荷ゼロの場合、損傷は修復のみ → D_crit = 0
        return 0.0

    # 損傷生成量
    damage_gen = alpha * (load ** m)

    # 修復関数の最大値: beta / (tau * e) at D = 1/tau
    repair_max = beta / (tau * math.e)

    if damage_gen >= repair_max:
        # 修復不能: 損傷生成が修復最大値を超える
        # D_crit として修復最大点を返す
        return 1.0 / tau

    # brentq で D_crit を求解:
    # g(D) = beta * D * exp(-tau * D) - damage_gen = 0
    # D ∈ (0, 1/tau) の区間で根を探索（修復関数の上昇区間）
    d_peak = 1.0 / tau

    def g(D: float) -> float:
        return beta * D * math.exp(-tau * D) - damage_gen

    try:
        d_crit = brentq(g, 1e-12, d_peak, xtol=1e-12, maxiter=200)
    except ValueError:
        # 根が見つからない場合のフォールバック
        d_crit = d_peak

    return float(d_crit)


# ─────────────────────────────────────────────────────────────────────
# 多日シミュレーション
# ─────────────────────────────────────────────────────────────────────

def simulate_trajectory(
    history: list[dict[str, float]],
    params: dict[str, float],
    days: int,
) -> list[dict[str, Any]]:
    """複数日にわたる損傷軌跡をシミュレーションする.

    過去のトレーニング履歴に基づき、日ごとの損傷変化を計算する。
    可視化（グラフ描画）用の時系列データを生成する。

    Args:
        history: 過去のトレーニング履歴 [{"day": int, "load": float}, ...]
        params: ODEパラメータ {"alpha", "beta", "tau", "m"}
        days: シミュレーション日数

    Returns:
        日ごとの損傷状態リスト [{"day", "load", "damage", "repair_rate", "is_critical", "d_crit"}]
    """
    alpha = params["alpha"]
    beta = params["beta"]
    tau = params["tau"]
    m = params["m"]

    # 負荷スケジュールを構築（historyにない日はload=0）
    load_schedule: dict[int, float] = {}
    for entry in history:
        day = int(entry["day"])
        load_schedule[day] = float(entry["load"])

    trajectory: list[dict[str, Any]] = []
    current_damage = 0.0

    for day in range(days):
        load = load_schedule.get(day, 0.0)
        d_crit = calculate_d_crit(alpha, beta, tau, m, load=max(load, 1e-6))

        result = simulate_damage(
            current_damage=current_damage,
            load=load,
            delta_t=1.0,
            alpha=alpha,
            beta=beta,
            tau=tau,
            m=m,
            n_steps=10,
        )

        current_damage = result["damage_after"]

        trajectory.append({
            "day": day,
            "load": load,
            "damage": round(current_damage, 8),
            "repair_rate": round(result["repair_rate"], 8),
            "is_critical": current_damage > d_crit,
            "d_crit": round(d_crit, 8),
        })

    return trajectory


# ─────────────────────────────────────────────────────────────────────
# ヘルパー関数
# ─────────────────────────────────────────────────────────────────────

def _compute_repair_rate(D: float, beta: float, tau: float) -> float:
    """現在の損傷レベルにおける修復速度を計算する.

    Args:
        D: 損傷レベル
        beta: 修復速度係数
        tau: 修復飽和因子

    Returns:
        修復速度 beta * D * exp(-tau * D)
    """
    D_clamped = max(D, _DAMAGE_FLOOR)
    exponent = -tau * D_clamped
    if exponent < -_EXP_CLIP:
        return 0.0
    return beta * D_clamped * math.exp(exponent)
