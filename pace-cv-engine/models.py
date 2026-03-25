"""PACE バイオメカニクスエンジン — Pydantic リクエスト/レスポンスモデル定義.

Sprint 2 (Tasks #7-11): 損傷リモデリングODEおよびEKFデカップリング検出用のデータモデル。
"""
from __future__ import annotations

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────
# ODE (損傷リモデリング) モデル
# ─────────────────────────────────────────────────────────────────────

class ODERequest(BaseModel):
    """損傷リモデリングODEの入力パラメータ.

    組織カテゴリごとに異なる係数を指定して、
    トレーニング負荷に対する組織損傷の経時変化をシミュレーションする。
    """

    tissue_category: str = Field(
        ...,
        description="組織カテゴリ: 'metabolic' | 'structural_soft' | 'structural_hard' | 'neuromotor'",
    )
    current_damage: float = Field(
        ...,
        ge=0.0,
        description="現在の損傷レベル D(t-1)",
    )
    load: float = Field(
        ...,
        ge=0.0,
        description="本日のトレーニング負荷",
    )
    delta_t: float = Field(
        default=1.0,
        gt=0.0,
        description="時間ステップ（日単位）",
    )
    alpha: float = Field(
        ...,
        gt=0.0,
        description="損傷生成係数",
    )
    beta: float = Field(
        ...,
        gt=0.0,
        description="修復速度係数",
    )
    tau: float = Field(
        ...,
        gt=0.0,
        description="修復飽和因子",
    )
    m: float = Field(
        ...,
        gt=0.0,
        description="負荷指数 (>1 で非線形影響)",
    )


class ODEResponse(BaseModel):
    """損傷リモデリングODEの出力結果.

    シミュレーション後の損傷レベル、修復速度、臨界判定を含む。
    """

    tissue_category: str = Field(
        ...,
        description="組織カテゴリ",
    )
    damage_before: float = Field(
        ...,
        description="シミュレーション前の損傷レベル",
    )
    damage_after: float = Field(
        ...,
        description="シミュレーション後の損傷レベル",
    )
    repair_rate: float = Field(
        ...,
        description="現在の修復速度",
    )
    is_critical: bool = Field(
        ...,
        description="D > D_crit かどうか",
    )
    d_crit: float = Field(
        ...,
        description="臨界損傷閾値",
    )
    simulation_points: list[dict] = Field(
        default_factory=list,
        description="可視化用の時系列データ",
    )


# ─────────────────────────────────────────────────────────────────────
# EKF (拡張カルマンフィルタ) モデル
# ─────────────────────────────────────────────────────────────────────

class EKFRequest(BaseModel):
    """EKFデカップリング検出の入力パラメータ.

    主観的RPEと客観的負荷の乖離を検出するための
    拡張カルマンフィルタの入力データ。
    """

    srpe: float = Field(
        ...,
        ge=0.0,
        le=10.0,
        description="主観的RPE (0-10)",
    )
    objective_load: float = Field(
        ...,
        ge=0.0,
        description="IMU由来の客観的負荷",
    )
    device_kappa: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="デバイス信頼度 (0-1)",
    )
    previous_state: float | None = Field(
        default=None,
        description="前回の隠れ状態推定値",
    )
    previous_covariance: float | None = Field(
        default=None,
        description="前回の誤差共分散",
    )
    process_noise: float = Field(
        default=0.1,
        gt=0.0,
        description="プロセスノイズ Q",
    )
    measurement_noise_subjective: float = Field(
        default=0.5,
        gt=0.0,
        description="主観的測定ノイズ R_subjective",
    )
    measurement_noise_objective: float = Field(
        default=0.2,
        gt=0.0,
        description="客観的測定ノイズ R_objective",
    )


class EKFResponse(BaseModel):
    """EKFデカップリング検出の出力結果.

    主観と客観の乖離度合い、異常検出結果を含む。
    """

    estimated_true_fatigue: float = Field(
        ...,
        description="隠れ状態推定値（真の疲労度）",
    )
    srpe_residual: float = Field(
        ...,
        description="sRPEイノベーション（残差）",
    )
    objective_residual: float = Field(
        ...,
        description="客観的負荷イノベーション（残差）",
    )
    is_decoupled: bool = Field(
        ...,
        description="デカップリング（異常）検出フラグ",
    )
    decoupling_severity: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="デカップリング重大度 (0-1)",
    )
    updated_state: float = Field(
        ...,
        description="更新後の状態推定値",
    )
    updated_covariance: float = Field(
        ...,
        description="更新後の誤差共分散",
    )
    mahalanobis_distance: float = Field(
        ...,
        ge=0.0,
        description="マハラノビス距離",
    )
