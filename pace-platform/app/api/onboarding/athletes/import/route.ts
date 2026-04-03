/**
 * POST /api/onboarding/athletes/import
 *
 * CSV ファイルから選手データをパースしてプレビューを返す。
 * まだデータベースには保存しない（プレビュー用途）。
 *
 * CSV フォーマット: name, position, number（ヘッダー行あり）
 *
 * Returns: { athletes: Array<{name, position, number}>, errors: string[] }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiHandler, ApiError } from '@/lib/api/handler';

export const POST = withApiHandler(async (req, _ctx) => {
  const supabase = await createClient();

  // 認証チェック
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。');
  }

  // multipart form data からファイルを取得
  const formData = await req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    throw new ApiError(400, 'CSVファイルが見つかりません。');
  }

  // MIME タイプバリデーション（CSV インジェクション防止）
  const allowedTypes = ['text/csv', 'text/plain', 'application/vnd.ms-excel'];
  if (file.type && !allowedTypes.includes(file.type)) {
    throw new ApiError(400, 'CSVファイル（.csv）のみアップロード可能です。');
  }

  // ファイル名バリデーション（パストラバーサル防止）
  if (file.name && !/^[\w\-. ]+\.csv$/i.test(file.name.split('/').pop() ?? '')) {
    throw new ApiError(400, 'ファイル名が不正です。.csv 拡張子のファイルを使用してください。');
  }

  // ファイルサイズ制限（1MB）
  if (file.size > 1024 * 1024) {
    throw new ApiError(400, 'ファイルサイズは1MB以下にしてください。');
  }

  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new ApiError(400, 'CSVにデータ行がありません。ヘッダー行を含めてください。');
  }

  // ヘッダー行をスキップ
  const dataLines = lines.slice(1);
  const athletes: Array<{ name: string; position: string; number: string }> = [];
  const errors: string[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const cols = parseCsvLine(line ?? '');

    if (cols.length < 1) {
      errors.push(`行${i + 2}: 空の行です。`);
      continue;
    }

    const name = sanitizeCsvCell(cols[0]?.trim() ?? '');
    if (!name) {
      errors.push(`行${i + 2}: 名前が空です。`);
      continue;
    }

    const position = sanitizeCsvCell(cols[1]?.trim() ?? '');
    const number = sanitizeCsvCell(cols[2]?.trim() ?? '');

    // 番号が数値かチェック（空でなければ）
    if (number && isNaN(parseInt(number, 10))) {
      errors.push(`行${i + 2}: 番号「${number}」は数値ではありません。`);
      continue;
    }

    athletes.push({ name, position, number });
  }

  // 上限チェック（500名まで）
  if (athletes.length > 500) {
    throw new ApiError(400, '一度に登録できる選手は500名までです。');
  }

  return NextResponse.json({
    athletes,
    errors,
    total: athletes.length,
  });
}, { service: 'onboarding' });

// ---------------------------------------------------------------------------
// CSV パーサー（簡易: カンマ区切り、ダブルクォート対応）
// ---------------------------------------------------------------------------

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // エスケープされたダブルクォート
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

/**
 * CSV セルの数式インジェクション対策。
 * =, +, -, @, \t, \r で始まるセルは攻撃の可能性があるため先頭を除去。
 */
function sanitizeCsvCell(value: string): string {
  if (!value) return value;
  // 数式インジェクションパターンを除去
  return value.replace(/^[=+\-@\t\r]+/, '');
}
