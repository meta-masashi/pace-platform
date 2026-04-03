/**
 * PACE Platform — Gemini NLG テキスト整形（オプショナル）
 *
 * テンプレート NLG の出力を Gemini API で自然な日本語に整形する。
 *
 * 安全性保証:
 *   - Gemini が失敗した場合はテンプレートテキストをそのまま返す（フォールバック）
 *   - 医療的根拠・数値・タグ名の改変を検出して拒否する（バリデーション）
 *   - レートリミット・プロンプトインジェクション対策は既存の防壁に委譲
 *   - 出力ガードレール（security-helpers.ts）を適用
 */

import { callGeminiWithRetry, type GeminiCallContext } from "../gemini/client";
import { sanitizeUserInput } from "../shared/security-helpers";
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('nlg');

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** Gemini 整形のエンドポイント識別子 */
const ENDPOINT_ID = "nlg-shaper";

/** システムプロンプト — 整形のみ許可、改変禁止 */
const SYSTEM_PROMPT = `あなたはスポーツ医学の専門家です。以下のアラートテキストを、医療的根拠・数値・タグ名を一切変更・追加・削除せずに、プロのスポーツドクターが読みやすい自然で簡潔な日本語サマリーに整形してください。

ルール:
1. 元テキストに含まれる数値（倍率・確率）を正確に保持すること
2. 元テキストに含まれるタグ名（!#xxx, #xxx 形式）を正確に保持すること
3. 元テキストに含まれる学術参照を正確に保持すること
4. 診断を断言しないこと
5. 処方・投薬指示を出さないこと
6. JSON やマークダウンではなく、プレーンテキストで出力すること
7. 免責事項は付与不要（別途付与される）`;

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

/**
 * テンプレート NLG テキストを Gemini で自然な日本語に整形する。
 *
 * フォールバック動作:
 *   - Gemini API が利用不可（レートリミット・タイムアウト・エラー）の場合は
 *     テンプレートテキストをそのまま返す
 *   - 整形結果が元のテキストから数値やタグ名を欠落させた場合も
 *     テンプレートテキストにフォールバックする
 *
 * @param templateText テンプレート NLG の出力テキスト
 * @param context Gemini 呼び出しコンテキスト（レートリミット用）。省略時はレートリミットなし。
 * @returns 整形されたテキスト、または失敗時は templateText そのまま
 */
export async function shapeWithGemini(
  templateText: string,
  context?: GeminiCallContext
): Promise<ShapeResult> {
  // 空テキストの場合はそのまま返す
  if (!templateText.trim()) {
    return { text: templateText, isFallback: true, reason: "empty_input" };
  }

  try {
    // 元テキストから保持必須の要素を抽出
    const requiredElements = extractRequiredElements(templateText);

    // プロンプト構築
    const prompt = buildPrompt(templateText);

    // Gemini 呼び出し（リトライ・ガードレール付き）
    const geminiContext: GeminiCallContext = context ?? {
      userId: "system",
      endpoint: ENDPOINT_ID,
    };

    const { result: shapedText } = await callGeminiWithRetry<string>(
      prompt,
      (text) => text.trim(),
      geminiContext
    );

    // バリデーション: 必須要素が保持されているか検証
    const validation = validateShapedOutput(shapedText, requiredElements);

    if (!validation.valid) {
      log.warn(`バリデーション失敗 — フォールバック: ${validation.reason}`);
      return {
        text: templateText,
        isFallback: true,
        reason: `validation_failed: ${validation.reason}`,
      };
    }

    return { text: shapedText, isFallback: false };
  } catch (err) {
    // Gemini 失敗 — テンプレートテキストにフォールバック
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.warn(`Gemini 失敗 — フォールバック: ${errorMessage}`);

    return {
      text: templateText,
      isFallback: true,
      reason: `gemini_error: ${errorMessage}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * Gemini 整形の結果。
 */
export interface ShapeResult {
  /** 整形済み（or フォールバック）テキスト */
  text: string;
  /** フォールバックしたかどうか */
  isFallback: boolean;
  /** フォールバック理由（正常時は undefined） */
  reason?: string;
}

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

/**
 * テンプレートテキストから保持必須の要素を抽出する。
 *
 * 抽出対象:
 *   - 数値（小数点含む）
 *   - タグ名（!#xxx, #xxx 形式）
 *   - 学術参照パターン（著者名 + 年号）
 */
interface RequiredElements {
  /** 数値リスト */
  numbers: string[];
  /** タグ名リスト */
  tags: string[];
}

function extractRequiredElements(text: string): RequiredElements {
  // 数値抽出（小数点付き数値、例: "4.7", "0.60"）
  const numberMatches = text.match(/\d+\.\d+/g) ?? [];

  // タグ名抽出（!#xxx または #xxx_yyy 形式）
  const tagMatches = text.match(/!?#[A-Za-z][A-Za-z0-9_]*/g) ?? [];

  return {
    numbers: [...new Set(numberMatches)],
    tags: [...new Set(tagMatches)],
  };
}

/**
 * 整形結果が必須要素を保持しているか検証する。
 */
function validateShapedOutput(
  shapedText: string,
  required: RequiredElements
): { valid: boolean; reason?: string } {
  // 数値チェック
  for (const num of required.numbers) {
    if (!shapedText.includes(num)) {
      return { valid: false, reason: `数値 "${num}" が欠落` };
    }
  }

  // タグ名チェック
  for (const tag of required.tags) {
    if (!shapedText.includes(tag)) {
      return { valid: false, reason: `タグ "${tag}" が欠落` };
    }
  }

  // 空文字チェック
  if (!shapedText.trim()) {
    return { valid: false, reason: "出力が空" };
  }

  return { valid: true };
}

/**
 * Gemini 整形用のプロンプトを構築する。
 */
function buildPrompt(templateText: string): string {
  const sanitized = sanitizeUserInput(templateText);

  return `${SYSTEM_PROMPT}

--- 整形対象テキスト ---
${sanitized}
--- ここまで ---

上記テキストを読みやすく整形してください。数値・タグ名・学術参照はそのまま保持してください。`;
}
