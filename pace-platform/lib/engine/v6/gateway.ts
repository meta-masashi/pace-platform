/**
 * PACE v6.0 — Edge Functions Gateway
 *
 * Python バイオメカニクスマイクロサービスへのプロキシクライアント。
 * ODE 組織ダメージ計算および EKF デカップリング検出を外部サービスに委託する。
 *
 * 設計方針:
 * - タイムアウト: 10秒
 * - リトライ: 最大2回（指数バックオフ）
 * - フォールバック: サービス不可時は保守的推定値を返す
 * - Node.js ネイティブ fetch() を使用
 */

import type { TissueCategory } from './types';

// ---------------------------------------------------------------------------
// 環境変数
// ---------------------------------------------------------------------------

/** バイオメカニクス API のベース URL */
const BIOMECHANICS_API_URL =
  process.env['BIOMECHANICS_API_URL'] ?? 'http://localhost:8080';

/** バイオメカニクス API の認証キー */
const BIOMECHANICS_API_KEY = process.env['BIOMECHANICS_API_KEY'] ?? '';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** リクエストタイムアウト（ミリ秒） */
const REQUEST_TIMEOUT_MS = 10_000;

/** 最大リトライ回数 */
const MAX_RETRIES = 2;

/** 初回リトライ待機時間（ミリ秒） */
const INITIAL_BACKOFF_MS = 500;

// ---------------------------------------------------------------------------
// ODE エンジン型定義
// ---------------------------------------------------------------------------

/** ODE エンジンへのリクエストパラメータ */
export interface ODERequestParams {
  /** 組織カテゴリ */
  tissueCategory: TissueCategory;
  /** 累積負荷履歴（日次セッション負荷の配列、古い順） */
  loadHistory: number[];
  /** 組織パラメータ */
  tissueParams: {
    halfLifeDays: number;
    alpha: number;
    beta: number;
    tau: number;
    m: number;
  };
}

/** ODE エンジンのレスポンス */
export interface ODEResponse {
  /** 現在のダメージ値 D(t) */
  damage: number;
  /** 臨界ダメージ値 D_crit */
  criticalDamage: number;
  /** サービスから取得できたかどうか */
  fromService: boolean;
}

// ---------------------------------------------------------------------------
// EKF エンジン型定義
// ---------------------------------------------------------------------------

/** EKF エンジンへのリクエストパラメータ */
export interface EKFRequestParams {
  /** 主観的負荷履歴（sRPE系列、古い順） */
  subjectiveLoadHistory: number[];
  /** 客観的負荷履歴（デバイス計測値系列、古い順） */
  objectiveLoadHistory: number[];
  /** デバイス信頼性 κ（0.0-1.0） */
  deviceKappa: number;
}

/** EKF エンジンのレスポンス */
export interface EKFResponse {
  /** デカップリングスコア */
  decouplingScore: number;
  /** サービスから取得できたかどうか */
  fromService: boolean;
}

// ---------------------------------------------------------------------------
// フォールバック値
// ---------------------------------------------------------------------------

/**
 * ODE エンジンのフォールバック推定値。
 * サービス不可時は保守的な中程度ダメージ値を返す。
 */
function createODEFallback(tissueCategory: TissueCategory): ODEResponse {
  // 保守的推定: 組織カテゴリに応じた中程度のダメージ
  const conservativeDamage: Record<TissueCategory, number> = {
    metabolic: 0.4,
    structural_soft: 0.3,
    structural_hard: 0.2,
    neuromotor: 0.35,
  };

  return {
    damage: conservativeDamage[tissueCategory],
    criticalDamage: 1.0,
    fromService: false,
  };
}

/**
 * EKF エンジンのフォールバック推定値。
 * サービス不可時はデカップリングなし（0.0）を返す。
 */
const EKF_FALLBACK: EKFResponse = {
  decouplingScore: 0.0,
  fromService: false,
};

// ---------------------------------------------------------------------------
// HTTP ヘルパー
// ---------------------------------------------------------------------------

/**
 * 指数バックオフ付きリトライで HTTP POST リクエストを送信する。
 *
 * @param url - リクエスト先 URL
 * @param body - リクエストボディ（JSON シリアライズ可能なオブジェクト）
 * @returns レスポンスの JSON パース結果
 * @throws サービス不可時（全リトライ失敗後）
 */
async function postWithRetry<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 2回目以降は指数バックオフで待機
    if (attempt > 0) {
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(BIOMECHANICS_API_KEY
            ? { Authorization: `Bearer ${BIOMECHANICS_API_KEY}` }
            : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('不明なエラー');
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * Python ODE エンジンを呼び出し、組織ダメージ D(t) を計算する。
 *
 * サービス不可時はフォールバックとして保守的推定値を返す。
 *
 * @param params - ODE 計算パラメータ
 * @returns ODE 計算結果（D(t) + D_crit）
 */
export async function callODEEngine(
  params: ODERequestParams,
): Promise<ODEResponse> {
  try {
    const url = `${BIOMECHANICS_API_URL}/compute/ode`;
    const result = await postWithRetry<{
      damage: number;
      critical_damage: number;
    }>(url, {
      tissue_category: params.tissueCategory,
      load_history: params.loadHistory,
      tissue_params: {
        half_life_days: params.tissueParams.halfLifeDays,
        alpha: params.tissueParams.alpha,
        beta: params.tissueParams.beta,
        tau: params.tissueParams.tau,
        m: params.tissueParams.m,
      },
    });

    return {
      damage: result.damage,
      criticalDamage: result.critical_damage,
      fromService: true,
    };
  } catch {
    // サービス不可: フォールバック
    return createODEFallback(params.tissueCategory);
  }
}

/**
 * Python EKF エンジンを呼び出し、デカップリングスコアを計算する。
 *
 * サービス不可時はフォールバックとしてデカップリングなし（0.0）を返す。
 *
 * @param params - EKF 計算パラメータ
 * @returns EKF 計算結果（デカップリングスコア）
 */
export async function callEKFEngine(
  params: EKFRequestParams,
): Promise<EKFResponse> {
  try {
    const url = `${BIOMECHANICS_API_URL}/compute/ekf`;
    const result = await postWithRetry<{
      decoupling_score: number;
    }>(url, {
      subjective_load_history: params.subjectiveLoadHistory,
      objective_load_history: params.objectiveLoadHistory,
      device_kappa: params.deviceKappa,
    });

    return {
      decouplingScore: result.decoupling_score,
      fromService: true,
    };
  } catch {
    // サービス不可: フォールバック
    return EKF_FALLBACK;
  }
}
