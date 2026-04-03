/**
 * PACE Platform — CV解析ジョブキュープロセッサー
 *
 * `cv_analysis_jobs` テーブルのジョブをポーリング処理する。
 *
 * 仕様:
 *   - ポーリング間隔: 30秒
 *   - ジョブステータス管理: pending → processing → completed / failed
 *   - 顔マスキング処理（face_masked_s3_key への保存）
 *   - リトライ: 最大3回、指数バックオフ（防壁4）
 *   - 並行実行上限: 5ジョブ
 *
 * 防壁1: 実際の CV API エンドポイントと通信（モック禁止）
 * 防壁4: 全 I/O に指数バックオフ付きリトライ
 */

import { withRetry } from "../shared/retry-handler";
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('cv');

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface CvAnalysisJob {
  id: string;
  athlete_id: string;
  /** 入力動画の S3 キー */
  input_s3_key: string;
  /** 顔マスキング済み動画の S3 キー（処理後に設定）*/
  face_masked_s3_key: string | null;
  status: JobStatus;
  retry_count: number;
  /** 最大リトライ回数 */
  max_retries: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  /** CV 解析結果（JSON）*/
  analysis_result: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface CvAnalysisResult {
  jobId: string;
  athleteId: string;
  faceMaskedS3Key: string;
  kinematics: {
    cmj_asymmetry_ratio?: number;
    rsi_norm?: number;
    knee_valgus_angle?: { left: number; right: number };
    hip_flexion_rom?: { left: number; right: number };
    confidence_score: number;
  };
  frameCount: number;
  processingTimeMs: number;
}

// Supabase クライアント最小型定義
type SupabaseJobClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        order: (col: string, opts?: { ascending?: boolean }) => {
          limit: (n: number) => Promise<{
            data: CvAnalysisJob[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    update: (data: Partial<CvAnalysisJob>) => {
      eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
};

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

/** ポーリング間隔（ms）*/
const POLLING_INTERVAL_MS = 30_000;

/** 並行実行上限 */
const MAX_CONCURRENT_JOBS = 5;

/** ジョブ最大リトライ回数 */
const DEFAULT_MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// CV API クライアント
// ---------------------------------------------------------------------------

/**
 * CV解析サービス API を呼び出す。
 * GEMINI_API_KEY 未設定時は警告を出してスキップ（graceful degradation）。
 */
async function callCvAnalysisApi(job: CvAnalysisJob): Promise<{
  faceMaskedS3Key: string;
  kinematics: CvAnalysisResult["kinematics"];
  frameCount: number;
}> {
  const cvApiUrl = process.env.CV_ANALYSIS_API_URL;
  const cvApiKey = process.env.CV_ANALYSIS_API_KEY;

  if (!cvApiUrl || !cvApiKey) {
    // 環境変数未設定は設定エラーとして明示的に失敗
    throw new Error(
      "CV_ANALYSIS_API_URL または CV_ANALYSIS_API_KEY が設定されていません。" +
      ".env.local を確認してください。"
    );
  }

  const response = await fetch(`${cvApiUrl}/v1/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": cvApiKey,
    },
    body: JSON.stringify({
      job_id: job.id,
      athlete_id: job.athlete_id,
      input_s3_key: job.input_s3_key,
      enable_face_masking: true,
      analysis_config: {
        detect_cmj: true,
        detect_landing_kinematics: true,
        detect_hip_flexion: true,
        compute_rsi: true,
      },
    }),
    signal: AbortSignal.timeout(120_000), // 2分タイムアウト
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`CV API HTTP ${response.status}: ${body}`);
  }

  // レスポンスを明示的な型で受け取る（防壁4: 型安全なパース）
  interface CvApiResponse {
    face_masked_s3_key: string;
    frame_count?: number;
    kinematics?: {
      cmj_asymmetry_ratio?: number;
      rsi_norm?: number;
      knee_valgus_angle?: { left: number; right: number };
      hip_flexion_rom?: { left: number; right: number };
      confidence_score?: number;
    };
  }

  const data = await response.json() as CvApiResponse;

  // レスポンスの必須フィールド確認（防壁4）
  if (!data.face_masked_s3_key || typeof data.face_masked_s3_key !== "string") {
    throw new Error("CV API: face_masked_s3_key が返されませんでした");
  }

  // exactOptionalPropertyTypes 準拠: undefined を明示的に除外してから代入
  const kinematics: CvAnalysisResult["kinematics"] = {
    confidence_score: data.kinematics?.confidence_score ?? 0,
  };
  if (data.kinematics?.cmj_asymmetry_ratio !== undefined) {
    kinematics.cmj_asymmetry_ratio = data.kinematics.cmj_asymmetry_ratio;
  }
  if (data.kinematics?.rsi_norm !== undefined) {
    kinematics.rsi_norm = data.kinematics.rsi_norm;
  }
  if (data.kinematics?.knee_valgus_angle !== undefined) {
    kinematics.knee_valgus_angle = data.kinematics.knee_valgus_angle;
  }
  if (data.kinematics?.hip_flexion_rom !== undefined) {
    kinematics.hip_flexion_rom = data.kinematics.hip_flexion_rom;
  }

  return {
    faceMaskedS3Key: data.face_masked_s3_key,
    kinematics,
    frameCount: data.frame_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// ジョブステータス管理
// ---------------------------------------------------------------------------

async function markJobProcessing(
  supabase: SupabaseJobClient,
  jobId: string
): Promise<void> {
  const { error } = await supabase
    .from("cv_analysis_jobs")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`[cv:processor] ジョブ ${jobId} ステータス更新失敗: ${error.message}`);
  }
}

async function markJobCompleted(
  supabase: SupabaseJobClient,
  jobId: string,
  faceMaskedS3Key: string,
  analysisResult: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("cv_analysis_jobs")
    .update({
      status: "completed",
      face_masked_s3_key: faceMaskedS3Key,
      analysis_result: analysisResult,
      completed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", jobId);

  if (error) {
    log.error(`ジョブ ${jobId} 完了更新失敗`, { data: { error: error.message } });
  }
}

async function markJobFailed(
  supabase: SupabaseJobClient,
  job: CvAnalysisJob,
  errorMessage: string
): Promise<void> {
  const newRetryCount = job.retry_count + 1;
  const maxRetries = job.max_retries ?? DEFAULT_MAX_RETRIES;
  const shouldRetry = newRetryCount < maxRetries;

  const { error } = await supabase
    .from("cv_analysis_jobs")
    .update({
      status: shouldRetry ? "pending" : "failed",
      retry_count: newRetryCount,
      error_message: errorMessage,
      completed_at: shouldRetry ? null : new Date().toISOString(),
    })
    .eq("id", job.id);

  if (error) {
    log.error(`ジョブ ${job.id} 失敗更新エラー`, { data: { error: error.message } });
  }

  if (shouldRetry) {
    log.warn(
      `ジョブ ${job.id} リトライ待機 (${newRetryCount}/${maxRetries}): ${errorMessage}`
    );
  } else {
    log.error(
      `ジョブ ${job.id} 最大リトライ超過、永続失敗: ${errorMessage}`
    );
  }
}

// ---------------------------------------------------------------------------
// 単一ジョブ処理
// ---------------------------------------------------------------------------

async function processJob(
  supabase: SupabaseJobClient,
  job: CvAnalysisJob
): Promise<void> {
  const startTime = Date.now();
  log.info(`ジョブ開始: id=${job.id} athlete=${job.athlete_id}`);

  // ステータスを processing に更新
  try {
    await markJobProcessing(supabase, job.id);
  } catch (err) {
    log.errorFromException(`ジョブ ${job.id} processing マーク失敗`, err);
    return;
  }

  try {
    // CV API 呼び出し（指数バックオフ付きリトライ — 防壁4）
    const { result: cvResult } = await withRetry(
      () => callCvAnalysisApi(job),
      {
        maxRetries: 3,
        baseDelayMs: 1_000,
        onRetry: (attempt, err) => {
          log.warn(
            `ジョブ ${job.id} CV API リトライ ${attempt}/3`,
            { data: { error: err instanceof Error ? err.message : String(err) } }
          );
        },
      }
    );

    const processingTimeMs = Date.now() - startTime;

    // 完了マーク
    await markJobCompleted(supabase, job.id, cvResult.faceMaskedS3Key, {
      kinematics: cvResult.kinematics,
      frame_count: cvResult.frameCount,
      processing_time_ms: processingTimeMs,
    });

    log.info(
      `ジョブ完了: id=${job.id} time=${processingTimeMs}ms` +
      ` confidence=${cvResult.kinematics.confidence_score.toFixed(2)}`
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error(`ジョブ ${job.id} 処理失敗: ${errorMessage}`);
    await markJobFailed(supabase, job, errorMessage);
  }
}

// ---------------------------------------------------------------------------
// ポーリングループ
// ---------------------------------------------------------------------------

/** ポーリング中かどうかのフラグ（多重起動防止）*/
let isPolling = false;

/**
 * pending ジョブを取得して処理する（1ポーリングサイクル）。
 * 並行実行上限 MAX_CONCURRENT_JOBS を遵守する。
 */
export async function pollAndProcessJobs(supabase: SupabaseJobClient): Promise<{
  processedCount: number;
  errorCount: number;
}> {
  // pending ジョブを最大 MAX_CONCURRENT_JOBS 件取得
  const { data: jobs, error } = await supabase
    .from("cv_analysis_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_CONCURRENT_JOBS);

  if (error) {
    log.error("ジョブ取得失敗", { data: { error: error.message } });
    return { processedCount: 0, errorCount: 1 };
  }

  if (!jobs || jobs.length === 0) {
    return { processedCount: 0, errorCount: 0 };
  }

  log.info(`${jobs.length} 件のジョブを並行処理開始`);

  // 並行実行（上限 MAX_CONCURRENT_JOBS）
  const results = await Promise.allSettled(
    jobs.map((job) => processJob(supabase, job))
  );

  let processedCount = 0;
  let errorCount = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      processedCount++;
    } else {
      errorCount++;
      log.errorFromException("ジョブ処理中に未捕捉エラー", result.reason);
    }
  }

  return { processedCount, errorCount };
}

// ---------------------------------------------------------------------------
// ポーリングスケジューラー
// ---------------------------------------------------------------------------

/**
 * 30秒間隔でジョブキューをポーリングする。
 * サーバーサイド（Next.js API Route / Supabase Edge Function 等）から呼ぶ。
 *
 * @returns ポーリングを停止する関数
 */
export function startJobPolling(supabase: SupabaseJobClient): () => void {
  if (isPolling) {
    log.warn("ポーリングは既に起動中です");
    return () => { /* noop */ };
  }

  isPolling = true;
  log.info(`ポーリング開始 (間隔=${POLLING_INTERVAL_MS}ms)`);

  let stopped = false;

  const poll = async () => {
    if (stopped) return;

    try {
      const { processedCount, errorCount } = await pollAndProcessJobs(supabase);
      if (processedCount > 0 || errorCount > 0) {
        log.info(
          `ポーリング完了: processed=${processedCount} errors=${errorCount}`
        );
      }
    } catch (err) {
      log.errorFromException("ポーリングエラー", err);
    }

    if (!stopped) {
      setTimeout(poll, POLLING_INTERVAL_MS);
    }
  };

  // 初回実行（即時）
  void poll();

  return () => {
    stopped = true;
    isPolling = false;
    log.info("ポーリング停止");
  };
}
