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

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 認証チェック
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: '認証が必要です。' },
        { status: 401 },
      );
    }

    // multipart form data からファイルを取得
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'CSVファイルが見つかりません。' },
        { status: 400 },
      );
    }

    // ファイルサイズ制限（1MB）
    if (file.size > 1024 * 1024) {
      return NextResponse.json(
        { error: 'ファイルサイズは1MB以下にしてください。' },
        { status: 400 },
      );
    }

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSVにデータ行がありません。ヘッダー行を含めてください。' },
        { status: 400 },
      );
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

      const name = cols[0]?.trim();
      if (!name) {
        errors.push(`行${i + 2}: 名前が空です。`);
        continue;
      }

      const position = cols[1]?.trim() ?? '';
      const number = cols[2]?.trim() ?? '';

      // 番号が数値かチェック（空でなければ）
      if (number && isNaN(parseInt(number, 10))) {
        errors.push(`行${i + 2}: 番号「${number}」は数値ではありません。`);
        continue;
      }

      athletes.push({ name, position, number });
    }

    // 上限チェック（500名まで）
    if (athletes.length > 500) {
      return NextResponse.json(
        { error: '一度に登録できる選手は500名までです。' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      athletes,
      errors,
      total: athletes.length,
    });
  } catch (err) {
    console.error('[onboarding/athletes/import] エラー:', err);
    return NextResponse.json(
      { error: 'CSV の処理中にエラーが発生しました。' },
      { status: 500 },
    );
  }
}

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
