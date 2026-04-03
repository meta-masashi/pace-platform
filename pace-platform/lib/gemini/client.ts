/**
 * PACE Platform — Gemini API クライアント
 *
 * 実装仕様（ADR-002準拠）:
 *   - 最大 3 回リトライ（指数バックオフ: 0 / 1000 / 2000ms）
 *   - ユーザー別レートリミット（防壁3）
 *   - トークン使用量追跡（Supabase gemini_token_log）
 *   - プロンプトインジェクション対策（防壁2）
 *   - 出力ガードレール（医療免責事項・危険コンテンツ検出）
 *   - 月次コール上限チェック
 *
 * 使用例:
 *   const { result } = await callGeminiWithRetry(
 *     buildPrompt(data),
 *     (text) => JSON.parse(cleanJsonResponse(text)) as MyType,
 *     { userId: staff.id, endpoint: "rehab-generator" }
 *   );
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('gemini');
import { sanitizeUserInput, detectHarmfulOutput, validateAIOutput, cleanJsonResponse } from "../shared/security-helpers";
import { checkRateLimit as checkRateLimitV2, logTokenUsage as logTokenUsageV2 } from "./rate-limiter";

export { cleanJsonResponse };

// ---------------------------------------------------------------------------
// モデル設定
// ---------------------------------------------------------------------------

const MODEL_ID = "gemini-2.5-pro";
const MAX_RETRIES = 3;

// シングルトンインスタンス
let _genAI: GoogleGenerativeAI | null = null;

function getModel() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY が設定されていません");
  }
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _genAI.getGenerativeModel({
    model: MODEL_ID,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  });
}

// ---------------------------------------------------------------------------
// レートリミット・トークン追跡（防壁3 — rate-limiter.ts に委譲）
// ---------------------------------------------------------------------------

/**
 * ユーザー別レートリミットチェック（毎分 + 日次上限）。
 * 超過時は RATE_LIMIT_EXCEEDED をスローする。
 */
async function checkRateLimitInternal(userId: string, endpoint: string): Promise<void> {
  const result = await checkRateLimitV2(userId, endpoint);
  if (!result.allowed) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }
}

/**
 * トークン使用量をログに記録する（ベストエフォート）。
 */
async function trackTokenUsage(
  userId: string,
  endpoint: string,
  inputChars: number
): Promise<void> {
  await logTokenUsageV2({
    staffId: userId,
    endpoint,
    inputChars,
    estimatedTokens: Math.ceil(inputChars / 4),
  });
}

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

export interface GeminiCallContext {
  /** 呼び出し元スタッフの ID（レートリミット・トークン追跡に使用）*/
  userId: string;
  /** エンドポイント識別子（例: "rehab-generator", "soap-assistant"）*/
  endpoint: string;
}

export interface GeminiResult<T> {
  result: T;
  /** リトライ後に成功した試行番号（1-indexed）*/
  attemptNumber: number;
}

/**
 * Gemini API を安全に呼び出す（リトライ・ガードレール付き）。
 *
 * @param prompt   完全なプロンプト文字列（ユーザー入力は事前にサニタイズ推奨）
 * @param parser   生テキストを T に変換するパーサー関数
 * @param context  ユーザー ID・エンドポイント情報（レートリミット用）
 *
 * @throws Error("RATE_LIMIT_EXCEEDED") — レートリミット超過
 * @throws Error("MONTHLY_LIMIT_EXCEEDED") — 月次上限超過
 * @throws Error("GUARDRAIL_VIOLATION") — 有害出力検出（全リトライ後）
 * @throws Error("GEMINI_EXHAUSTED") — 全リトライ失敗
 */
export async function callGeminiWithRetry<T>(
  prompt: string,
  parser: (text: string) => T,
  context?: GeminiCallContext
): Promise<GeminiResult<T>> {
  // レートリミット + 日次上限チェック（防壁3 — rate-limiter.ts 経由）
  if (context) {
    await checkRateLimitInternal(context.userId, context.endpoint);
  }

  // プロンプトサニタイズ（防壁2）
  const sanitizedPrompt = sanitizeUserInput(prompt);

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // 指数バックオフ: 0ms → 1000ms → 2000ms（防壁4）
    const delay = attempt > 0 ? Math.pow(2, attempt) * 500 : 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    try {
      // トークン追跡（ベストエフォート）
      if (context) {
        await trackTokenUsage(context.userId, context.endpoint, sanitizedPrompt.length);
      }

      const model = getModel();
      const response = await model.generateContent(sanitizedPrompt);
      const rawText = response.response.text();

      // 出力ガードレール（防壁2）— 有害コンテンツ検出
      if (detectHarmfulOutput(rawText)) {
        throw new Error("GUARDRAIL_VIOLATION");
      }

      // 出力バリデーション（防壁2）— PII・URL・免責文チェック
      const validation = validateAIOutput(rawText);
      if (validation.warnings.length > 0) {
        log.warn(`出力バリデーション警告 (endpoint=${context?.endpoint})`, { data: { warnings: validation.warnings } });
      }

      return { result: parser(validation.sanitized), attemptNumber: attempt + 1 };
    } catch (err) {
      lastError = err;

      // ガードレール違反はリトライしない（プロンプト自体の問題）
      if (err instanceof Error && err.message === "GUARDRAIL_VIOLATION") {
        log.error(`ガードレール違反 attempt=${attempt + 1}`);
        break;
      }

      log.errorFromException(`attempt ${attempt + 1}/${MAX_RETRIES} 失敗`, err);
    }
  }

  log.errorFromException('全リトライ失敗', lastError);
  throw new Error("GEMINI_EXHAUSTED");
}

// ---------------------------------------------------------------------------
// システムプロンプトプレフィックス（CDS ガードレール）
// ---------------------------------------------------------------------------

/**
 * PACE CDS システムプレフィックス。
 * 全プロンプトの先頭に付与してガードレールを強化する。
 */
export function buildCdsSystemPrefix(): string {
  return `あなたはスポーツ医学クリニカル・ディシジョン・サポート（CDS）AIアシスタントです。
以下のルールを厳守してください：
1. 医療診断を断言しないこと（「〇〇です」「〇〇と診断します」は絶対禁止）
2. 処方・投薬指示を出さないこと
3. 外科的処置を推奨しないこと
4. 最終判断は必ず有資格スタッフ（AT/PT/医師）が行う旨を意識した記述にすること
5. 出力は必ず指定されたJSON形式のみとすること（説明文・マークダウン・コードブロック不要）
6. 個人を特定できる情報（氏名・連絡先等）を出力に含めないこと

`;
}

// ---------------------------------------------------------------------------
// 医療免責事項（出力ガードレール / 防壁2）
// ---------------------------------------------------------------------------

/** 全 AI 生成コンテンツに付与する医療免責事項 */
export const MEDICAL_DISCLAIMER =
  "※ この出力はAIによる補助情報です。最終的な判断・処置は必ず有資格スタッフが行ってください。";
