/**
 * PACE Platform — Dify API クライアント
 *
 * PACE 向けワークフロー定義:
 *   - rehab-protocol-generator    リハビリプロトコル生成
 *   - injury-risk-analyzer        受傷リスク分析
 *   - return-to-play-advisor      RTP判断支援
 *
 * ストリーミング対応（SSE）/ エラー時 Gemini フォールバック。
 *
 * 防壁1: 実際の Dify API と通信（モック禁止）
 * 防壁2: `sanitizeUserInput()` / `buildCdsSystemPrefix()` 適用
 * 防壁3: ユーザー別 inputs にスタッフ ID を含めてレート追跡
 * 防壁4: 指数バックオフ付きリトライ
 */

import { buildCdsSystemPrefix, callGeminiWithRetry, type GeminiCallContext } from "../gemini/client";
import { sanitizeUserInput, detectInjectionAttempt } from "../shared/security-helpers";
import { withRetry } from "../shared/retry-handler";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** PACE 向け Dify ワークフロー ID */
export type PaceWorkflowId =
  | "rehab-protocol-generator"
  | "injury-risk-analyzer"
  | "return-to-play-advisor";

export interface DifyWorkflowInput {
  workflowId: PaceWorkflowId;
  inputs: Record<string, string>;
  userId: string;
  /** ストリーミングモードを使用するか（デフォルト: true）*/
  streaming?: boolean;
}

export interface DifyWorkflowResult {
  workflowId: PaceWorkflowId;
  outputs: Record<string, unknown>;
  /** 使用されたバックエンド（dify | gemini-fallback）*/
  backend: "dify" | "gemini-fallback";
  /** ストリーミング時は undefined（stream を参照）*/
  text?: string;
  stream?: ReadableStream<Uint8Array>;
}

/** Dify SSE イベントの型 */
interface DifySseEvent {
  event: string;
  task_id?: string;
  workflow_run_id?: string;
  data?: {
    outputs?: Record<string, unknown>;
    status?: string;
    error?: string;
    text?: string;
  };
}

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

function getDifyApiBase(): string {
  const base = process.env.DIFY_API_BASE;
  if (!base) throw new Error("DIFY_API_BASE が設定されていません");
  return base.replace(/\/$/, "");
}

function getDifyApiKey(workflowId: PaceWorkflowId): string {
  // ワークフロー別の API キーに対応（環境変数キー: DIFY_API_KEY_{WORKFLOW_ID_UPPER}）
  const envKey = `DIFY_API_KEY_${workflowId.replace(/-/g, "_").toUpperCase()}`;
  const specificKey = process.env[envKey];
  if (specificKey) return specificKey;

  // フォールバック: 共通 API キー
  const commonKey = process.env.DIFY_API_KEY;
  if (!commonKey) {
    throw new Error(
      `Dify API キーが設定されていません。${envKey} または DIFY_API_KEY を設定してください。`
    );
  }
  return commonKey;
}

// ---------------------------------------------------------------------------
// ストリーミング実行
// ---------------------------------------------------------------------------

/**
 * Dify ワークフローをストリーミングモードで実行する。
 * SSE (Server-Sent Events) の ReadableStream を返す。
 */
async function runDifyWorkflowStreaming(
  workflowId: PaceWorkflowId,
  sanitizedInputs: Record<string, string>,
  userId: string
): Promise<ReadableStream<Uint8Array>> {
  const apiBase = getDifyApiBase();
  const apiKey = getDifyApiKey(workflowId);

  const response = await fetch(`${apiBase}/v1/workflows/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: sanitizedInputs,
      response_mode: "streaming",
      user: userId,
    }),
    signal: AbortSignal.timeout(60_000), // 60秒タイムアウト
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Dify API HTTP ${response.status}: ${body}`);
  }

  if (!response.body) {
    throw new Error("Dify API: レスポンスボディが空です");
  }

  return response.body;
}

// ---------------------------------------------------------------------------
// ブロッキング実行（非ストリーミング）
// ---------------------------------------------------------------------------

/**
 * Dify ワークフローをブロッキングモードで実行する。
 * 完全なレスポンスを待機して返す。
 */
async function runDifyWorkflowBlocking(
  workflowId: PaceWorkflowId,
  sanitizedInputs: Record<string, string>,
  userId: string
): Promise<Record<string, unknown>> {
  const apiBase = getDifyApiBase();
  const apiKey = getDifyApiKey(workflowId);

  const response = await fetch(`${apiBase}/v1/workflows/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: sanitizedInputs,
      response_mode: "blocking",
      user: userId,
    }),
    signal: AbortSignal.timeout(120_000), // 2分タイムアウト
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Dify API HTTP ${response.status}: ${body}`);
  }

  const data = await response.json();

  // 防壁4: レスポンス検証
  if (!data || typeof data !== "object") {
    throw new Error("Dify API: 無効なJSONレスポンス");
  }

  // Dify blocking レスポンスの outputs を抽出
  const outputs = (data as { data?: { outputs?: Record<string, unknown> } }).data?.outputs;
  if (!outputs) {
    throw new Error("Dify API: outputs フィールドが見つかりません");
  }

  return outputs;
}

// ---------------------------------------------------------------------------
// Gemini フォールバック
// ---------------------------------------------------------------------------

/**
 * Dify が利用不可の場合に Gemini でフォールバック応答を生成する。
 *
 * ワークフロー別のフォールバックプロンプトを使用して、
 * Dify と同等の出力形式を維持する。
 */
async function runGeminiFallback(
  workflowId: PaceWorkflowId,
  inputs: Record<string, string>,
  staffContext: GeminiCallContext
): Promise<string> {
  const systemPrefix = buildCdsSystemPrefix();

  const workflowPrompts: Record<PaceWorkflowId, string> = {
    "rehab-protocol-generator": `${systemPrefix}
以下のアスリート情報に基づいて、段階的なリハビリプロトコルをJSON形式で生成してください。
フェーズ別（急性期 / 回復期 / 機能回復期）で設計し、各エクサ サイズにセット数・レップ数・注意事項を含めること。

入力情報:
${Object.entries(inputs)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}`,

    "injury-risk-analyzer": `${systemPrefix}
以下のデータに基づいて、受傷リスクを分析しJSONで出力してください。
リスクレベル（critical/high/medium/low）・主要リスク因子・推奨対策を含めること。

入力情報:
${Object.entries(inputs)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}`,

    "return-to-play-advisor": `${systemPrefix}
以下のアスリートデータに基づいて、復帰可否の判断支援情報をJSONで出力してください。
RTP段階（段階1-6）・現在の推奨段階・チェックリスト・注意事項を含めること。
最終判断は有資格スタッフが行う旨を明記すること。

入力情報:
${Object.entries(inputs)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}`,
  };

  const prompt = workflowPrompts[workflowId];

  const { result } = await callGeminiWithRetry(
    prompt,
    (text) => text.trim(),
    staffContext
  );

  return result;
}

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

/**
 * PACE Dify ワークフローを実行する。
 *
 * - プロンプトインジェクション検出（防壁2）
 * - 入力サニタイズ（防壁2）
 * - Dify API 呼び出し（指数バックオフ付きリトライ — 防壁4）
 * - エラー時 Gemini フォールバック
 *
 * @param input          ワークフロー実行パラメータ
 * @param staffContext   スタッフコンテキスト（Geminiフォールバック用）
 */
export async function runPaceWorkflow(
  input: DifyWorkflowInput,
  staffContext: GeminiCallContext
): Promise<DifyWorkflowResult> {
  const { workflowId, inputs, userId, streaming = true } = input;

  // プロンプトインジェクション検出（防壁2）
  for (const [key, value] of Object.entries(inputs)) {
    if (detectInjectionAttempt(value)) {
      console.warn(
        `[dify:client] プロンプトインジェクション検出: workflow=${workflowId} field=${key} userId=${userId}`
      );
      throw new Error("不適切な入力を検出しました。入力内容を変更してお試しください。");
    }
  }

  // 全 inputs をサニタイズ（防壁2）
  const sanitizedInputs: Record<string, string> = {};
  for (const [key, value] of Object.entries(inputs)) {
    sanitizedInputs[key] = sanitizeUserInput(value);
  }

  // Dify API 呼び出し（リトライ付き — 防壁4）
  try {
    if (streaming) {
      const { result: stream } = await withRetry(
        () => runDifyWorkflowStreaming(workflowId, sanitizedInputs, userId),
        {
          maxRetries: 3,
          baseDelayMs: 1_000,
          onRetry: (attempt, err) => {
            console.warn(
              `[dify:client] ストリーミング リトライ ${attempt}/3 (workflow=${workflowId}):`,
              err
            );
          },
          // 4xx エラーはリトライしない（クライアントサイドの問題）
          shouldNotRetry: (err) =>
            err instanceof Error && /HTTP 4\d\d/.test(err.message),
        }
      );

      return { workflowId, outputs: {}, backend: "dify", stream };
    } else {
      const { result: outputs } = await withRetry(
        () => runDifyWorkflowBlocking(workflowId, sanitizedInputs, userId),
        {
          maxRetries: 3,
          baseDelayMs: 1_000,
          onRetry: (attempt, err) => {
            console.warn(
              `[dify:client] ブロッキング リトライ ${attempt}/3 (workflow=${workflowId}):`,
              err
            );
          },
          shouldNotRetry: (err) =>
            err instanceof Error && /HTTP 4\d\d/.test(err.message),
        }
      );

      return { workflowId, outputs, backend: "dify" };
    }
  } catch (difyError) {
    // Dify 失敗 → Gemini フォールバック
    console.warn(
      `[dify:client] Dify API 失敗、Gemini フォールバックに切替 (workflow=${workflowId}):`,
      difyError
    );

    const fallbackText = await runGeminiFallback(workflowId, sanitizedInputs, staffContext);

    return {
      workflowId,
      outputs: { text: fallbackText },
      backend: "gemini-fallback",
      text: fallbackText,
    };
  }
}

// ---------------------------------------------------------------------------
// ストリーミングテキスト収集ユーティリティ
// ---------------------------------------------------------------------------

/**
 * Dify SSE ストリームからテキストを収集して文字列を返す。
 * ストリーミングレスポンスをサーバーサイドで集約する場合に使用。
 *
 * @param stream  `runPaceWorkflow()` が返す ReadableStream
 * @returns 収集されたテキスト全体
 */
export async function collectStreamText(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const textParts: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });

      // SSE 行の解析（"data: {...}" 形式）
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const event = JSON.parse(jsonStr) as DifySseEvent;

          // workflow_finished イベントの outputs.text を収集
          if (event.event === "workflow_finished" && event.data?.outputs?.text) {
            textParts.push(String(event.data.outputs.text));
          }
          // text_chunk イベント（チャンク単位のテキスト）
          if (event.event === "text_chunk" && event.data?.text) {
            textParts.push(event.data.text);
          }
        } catch {
          // 解析不能なイベントはスキップ（防壁4: JSONパース失敗時の継続）
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return textParts.join("");
}

// ---------------------------------------------------------------------------
// ワークフロー別ショートカット関数
// ---------------------------------------------------------------------------

/**
 * リハビリプロトコルを生成する（ブロッキングモード）。
 */
export async function generateRehabProtocol(
  inputs: {
    injury_description: string;
    athlete_profile: string;
    phase?: string;
    contraindication_tags?: string;
  },
  staffContext: GeminiCallContext
): Promise<DifyWorkflowResult> {
  return runPaceWorkflow(
    {
      workflowId: "rehab-protocol-generator",
      inputs: inputs as Record<string, string>,
      userId: staffContext.userId,
      streaming: false,
    },
    staffContext
  );
}

/**
 * 受傷リスクを分析する（ブロッキングモード）。
 */
export async function analyzeInjuryRisk(
  inputs: {
    athlete_data: string;
    assessment_results?: string;
    cv_kinematics?: string;
  },
  staffContext: GeminiCallContext
): Promise<DifyWorkflowResult> {
  return runPaceWorkflow(
    {
      workflowId: "injury-risk-analyzer",
      inputs: inputs as Record<string, string>,
      userId: staffContext.userId,
      streaming: false,
    },
    staffContext
  );
}

/**
 * 復帰判断支援情報を取得する（ブロッキングモード）。
 */
export async function adviseReturnToPlay(
  inputs: {
    athlete_id: string;
    injury_description: string;
    current_status: string;
    rtp_criteria?: string;
  },
  staffContext: GeminiCallContext
): Promise<DifyWorkflowResult> {
  return runPaceWorkflow(
    {
      workflowId: "return-to-play-advisor",
      inputs: inputs as Record<string, string>,
      userId: staffContext.userId,
      streaming: false,
    },
    staffContext
  );
}
