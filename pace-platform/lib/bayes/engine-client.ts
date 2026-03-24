/**
 * PACE Platform — ベイズ推論エンジン HTTP クライアント
 *
 * Python FastAPI マイクロサービスへのクライアント。
 * 指数バックオフ付きリトライ実装（防壁4）。
 *
 * FastAPI エンドポイント:
 *   GET  /health         — ヘルスチェック
 *   POST /predict        — 推論実行（CAT 1 ステップ）
 *   POST /predict/batch  — バッチ推論
 *   GET  /nodes          — ノード一覧取得
 */

import type {
  BayesApiHealthResponse,
  BayesApiPredictRequest,
  BayesApiPredictResponse,
  AssessmentNode,
  AssessmentType,
  InferenceSession,
  AthleteContext,
} from "./types";

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 10_000; // 10 秒

/** SSRF 防止: BAYES_ENGINE_URL を https:// のみ許可（防壁1） */
function getBayesServiceUrl(): string {
  const url = process.env.BAYES_ENGINE_URL;
  if (!url) throw new Error("BAYES_ENGINE_URL が設定されていません");
  if (!url.startsWith("https://")) {
    throw new Error("BAYES_ENGINE_URL は https:// で始まる必要があります（SSRF防止）");
  }
  return url.replace(/\/$/, "");
}

function getBayesApiKey(): string {
  const key = process.env.BAYES_ENGINE_API_KEY;
  if (!key) throw new Error("BAYES_ENGINE_API_KEY が設定されていません");
  return key;
}

// ---------------------------------------------------------------------------
// 共通 fetch ラッパー（リトライ + タイムアウト）
// ---------------------------------------------------------------------------

async function fetchWithRetry<T>(
  path: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<T> {
  const baseUrl = getBayesServiceUrl();
  const apiKey = getBayesApiKey();
  const url = `${baseUrl}${path}`;

  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    // 指数バックオフ（防壁4）: 0ms → 1000ms → 2000ms
    if (attempt > 0) {
      const delay = Math.pow(2, attempt - 1) * 1_000;
      await new Promise((r) => setTimeout(r, delay));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`BayesEngine HTTP ${response.status}: ${body}`);
      }

      const data = await response.json();

      // JSONパース成功チェック（防壁4）
      if (typeof data !== "object" || data === null) {
        throw new Error("BayesEngine: 無効なJSONレスポンス");
      }

      return data as T;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      // AbortError（タイムアウト）は特別扱い
      if (err instanceof Error && err.name === "AbortError") {
        console.warn(`[bayes:client] タイムアウト attempt=${attempt + 1}`);
      } else {
        console.warn(`[bayes:client] attempt ${attempt + 1}/${retries} 失敗:`, err);
      }
    }
  }

  throw new Error(`[bayes:client] 全リトライ失敗: ${lastError}`);
}

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

/**
 * ベイズ推論エンジンのヘルスチェック。
 * アプリ起動時・Supabase Edge Function からの定期チェックに使用。
 */
export async function checkBayesEngineHealth(): Promise<BayesApiHealthResponse> {
  return fetchWithRetry<BayesApiHealthResponse>("/health", { method: "GET" }, 1);
}

/**
 * アセスメント 1 ステップ分の推論を実行する（CAT: Computerized Adaptive Testing）。
 *
 * @param session          現在のセッション状態
 * @param athleteContext   アスリートの生体力学・疲労コンテキスト（v3）
 * @param useV3Engine      v3 動的ベイズネットワークを使用するか
 */
export async function runInferenceStep(
  session: InferenceSession,
  athleteContext?: AthleteContext,
  useV3Engine = true
): Promise<BayesApiPredictResponse> {
  const requestBody: BayesApiPredictRequest = {
    session,
    ...(athleteContext !== undefined && { athlete_context: athleteContext }),
    use_v3_engine: useV3Engine,
  };

  return fetchWithRetry<BayesApiPredictResponse>("/predict", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

/**
 * 指定した評価タイプのノード一覧を取得する。
 * アセスメント UI の初期化に使用。
 */
export async function getAssessmentNodes(
  assessmentType: AssessmentType,
  limit = 50
): Promise<AssessmentNode[]> {
  const params = new URLSearchParams({
    assessment_type: assessmentType,
    limit: String(limit),
    active_only: "true",
  });

  return fetchWithRetry<AssessmentNode[]>(`/nodes?${params.toString()}`, {
    method: "GET",
  });
}

/**
 * セッションを完了させて最終診断結果を取得する。
 * 中断されたセッションの回復にも使用する。
 */
export async function finalizeSession(
  sessionId: string,
  session: InferenceSession,
  athleteContext?: AthleteContext
): Promise<BayesApiPredictResponse> {
  return fetchWithRetry<BayesApiPredictResponse>("/predict/finalize", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      session,
      athlete_context: athleteContext,
      force_complete: true,
    }),
  });
}

/**
 * ベイズ推論エンジンの接続可否を確認する。
 * Next.js の API Route から呼ぶ簡易チェック用。
 *
 * @returns true = 接続可能、false = 接続不可（サービス利用不可）
 */
export async function isBayesEngineAvailable(): Promise<boolean> {
  try {
    const health = await checkBayesEngineHealth();
    return health.status === "ok" || health.status === "degraded";
  } catch {
    return false;
  }
}
