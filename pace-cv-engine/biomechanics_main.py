"""PACE バイオメカニクスエンジン — FastAPI アプリケーションエントリーポイント.

Sprint 2 (Tasks #7-11): 損傷リモデリングODEおよびEKFデカップリング検出の
RESTful APIサーバー。

エンドポイント:
  - GET  /health        : ヘルスチェック
  - POST /compute/ode   : 損傷リモデリングODEシミュレーション
  - POST /compute/ekf   : EKFデカップリング検出
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader

from engines.ekf_engine import run_ekf_step
from engines.ode_engine import calculate_d_crit, simulate_damage
from models import EKFRequest, EKFResponse, ODERequest, ODEResponse

# ─────────────────────────────────────────────────────────────────────
# ロギング設定
# ─────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("pace.biomechanics")


# ─────────────────────────────────────────────────────────────────────
# 認証設定
# ─────────────────────────────────────────────────────────────────────

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)
PACE_INTERNAL_API_KEY = os.environ.get("PACE_INTERNAL_API_KEY", "")


async def verify_api_key(
    api_key: str | None = Security(API_KEY_HEADER),
) -> str:
    """APIキー認証を検証する.

    環境変数 PACE_INTERNAL_API_KEY が未設定の場合、認証をスキップする
    （開発環境用）。設定されている場合、リクエストヘッダーの X-API-Key と照合する。

    Args:
        api_key: リクエストヘッダーから取得したAPIキー

    Returns:
        検証済みのAPIキー文字列

    Raises:
        HTTPException: APIキーが無効な場合 (403)
    """
    if not PACE_INTERNAL_API_KEY:
        # 開発環境: APIキー未設定の場合はスキップ
        return "dev-mode"

    if api_key is None or api_key != PACE_INTERNAL_API_KEY:
        logger.warning("api_key_invalid: リクエストが拒否されました")
        raise HTTPException(
            status_code=403,
            detail="無効なAPIキーです",
        )

    return api_key


# ─────────────────────────────────────────────────────────────────────
# FastAPI アプリケーション
# ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="PACE Biomechanics Engine",
    description="計算バイオメカニクスマイクロサービス — 損傷リモデリングODE & EKFデカップリング検出",
    version="0.1.0",
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://hachi-riskon.com",
        "https://*.hachi-riskon.com",
        "http://localhost:3000",
        "http://localhost:8080",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    allow_credentials=True,
)


# ─────────────────────────────────────────────────────────────────────
# ミドルウェア: リクエスト/レスポンスロギング
# ─────────────────────────────────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next: Any) -> Any:
    """全リクエスト/レスポンスのロギングミドルウェア.

    処理時間、ステータスコード、エンドポイント情報を記録する。
    """
    start_time = time.monotonic()
    method = request.method
    path = request.url.path

    logger.info("request_start: %s %s", method, path)

    response = await call_next(request)

    elapsed_ms = (time.monotonic() - start_time) * 1000.0
    logger.info(
        "request_end: %s %s status=%d elapsed=%.1fms",
        method,
        path,
        response.status_code,
        elapsed_ms,
    )

    return response


# ─────────────────────────────────────────────────────────────────────
# エンドポイント
# ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check() -> dict[str, str]:
    """ヘルスチェックエンドポイント.

    サービスの稼働状態を確認するために使用する。
    ロードバランサーやオーケストレータからの定期チェック用。

    Returns:
        サービスのステータス情報
    """
    return {
        "status": "healthy",
        "service": "pace-biomechanics-engine",
        "version": "0.1.0",
    }


@app.post("/compute/ode", response_model=ODEResponse)
async def compute_ode(
    request: ODERequest,
    _api_key: str = Depends(verify_api_key),
) -> ODEResponse:
    """損傷リモデリングODEシミュレーションエンドポイント.

    組織カテゴリごとのパラメータに基づき、トレーニング負荷に対する
    組織損傷の経時変化を計算する。

    Args:
        request: ODEシミュレーションの入力パラメータ

    Returns:
        シミュレーション結果（損傷レベル、修復速度、臨界判定、時系列データ）

    Raises:
        HTTPException: 計算エラーが発生した場合 (500)
    """
    logger.info(
        "ode_compute_start: tissue=%s load=%.2f D0=%.4f",
        request.tissue_category,
        request.load,
        request.current_damage,
    )

    try:
        # ODEシミュレーション実行
        result = simulate_damage(
            current_damage=request.current_damage,
            load=request.load,
            delta_t=request.delta_t,
            alpha=request.alpha,
            beta=request.beta,
            tau=request.tau,
            m=request.m,
        )

        # 臨界損傷閾値の計算
        d_crit = calculate_d_crit(
            alpha=request.alpha,
            beta=request.beta,
            tau=request.tau,
            m=request.m,
            load=max(request.load, 1e-6),
        )

        damage_after = result["damage_after"]
        is_critical = damage_after > d_crit

        logger.info(
            "ode_compute_done: tissue=%s D_before=%.4f D_after=%.4f D_crit=%.4f critical=%s",
            request.tissue_category,
            request.current_damage,
            damage_after,
            d_crit,
            is_critical,
        )

        return ODEResponse(
            tissue_category=request.tissue_category,
            damage_before=request.current_damage,
            damage_after=damage_after,
            repair_rate=result["repair_rate"],
            is_critical=is_critical,
            d_crit=d_crit,
            simulation_points=result["simulation_points"],
        )

    except Exception as exc:
        logger.exception("ode_compute_error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"ODE計算エラー: {exc!s}",
        ) from exc


@app.post("/compute/ekf", response_model=EKFResponse)
async def compute_ekf(
    request: EKFRequest,
    _api_key: str = Depends(verify_api_key),
) -> EKFResponse:
    """EKFデカップリング検出エンドポイント.

    主観的RPEとIMU由来の客観的負荷の乖離を
    拡張カルマンフィルタで検出する。

    Args:
        request: EKFの入力パラメータ

    Returns:
        デカップリング検出結果（推定疲労度、残差、異常判定、重大度）

    Raises:
        HTTPException: 計算エラーが発生した場合 (500)
    """
    logger.info(
        "ekf_compute_start: sRPE=%.1f obj_load=%.2f kappa=%.2f",
        request.srpe,
        request.objective_load,
        request.device_kappa,
    )

    try:
        result = run_ekf_step(
            srpe=request.srpe,
            objective_load=request.objective_load,
            device_kappa=request.device_kappa,
            previous_state=request.previous_state,
            previous_covariance=request.previous_covariance,
            process_noise=request.process_noise,
            measurement_noise_subjective=request.measurement_noise_subjective,
            measurement_noise_objective=request.measurement_noise_objective,
        )

        logger.info(
            "ekf_compute_done: fatigue=%.4f decoupled=%s severity=%.2f mahal=%.4f",
            result["estimated_true_fatigue"],
            result["is_decoupled"],
            result["decoupling_severity"],
            result["mahalanobis_distance"],
        )

        return EKFResponse(
            estimated_true_fatigue=result["estimated_true_fatigue"],
            srpe_residual=result["srpe_residual"],
            objective_residual=result["objective_residual"],
            is_decoupled=result["is_decoupled"],
            decoupling_severity=result["decoupling_severity"],
            updated_state=result["updated_state"],
            updated_covariance=result["updated_cov"],
            mahalanobis_distance=result["mahalanobis_distance"],
        )

    except Exception as exc:
        logger.exception("ekf_compute_error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"EKF計算エラー: {exc!s}",
        ) from exc
