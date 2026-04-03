/**
 * POST /api/approval/batch
 * ============================================================
 * 複数アラートの一括承認（M11: ワンタップ・アプルーバル）
 *
 * normal リスクの複数カードを一括で approve/reject する。
 * P1(critical) / P2(watchlist) は M20 により個別承認必須のため除外。
 *
 * リクエストボディ:
 * {
 *   items: Array<{
 *     athleteId: string;
 *     evidenceText: string;
 *     nlgText?: string;
 *     riskScore?: number;
 *   }>;
 *   action: 'approve' | 'reject';
 * }
 * ============================================================
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAuditEntry } from '@/lib/audit/worm';
import { withApiHandler, ApiError } from '@/lib/api/handler';

interface BatchItem {
  athleteId: string;
  evidenceText: string;
  nlgText?: string;
  riskScore?: number;
}

interface BatchRequestBody {
  items: BatchItem[];
  action: 'approve' | 'reject';
}

interface BatchResult {
  athleteId: string;
  auditId: string;
  timestamp: string;
}

export const POST = withApiHandler(async (req, _ctx) => {
  // ----- 認証チェック -----
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。');
  }

  // ----- スタッフ権限チェック -----
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single();

  if (staffError || !staff) {
    throw new ApiError(403, 'スタッフ情報が見つかりません。');
  }

  const allowedRoles = ['AT', 'PT', 'master'];
  if (!allowedRoles.includes(staff.role as string)) {
    throw new ApiError(403, 'この操作にはAT、PT、またはmaster権限が必要です。');
  }

  // ----- リクエストボディのパース -----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'リクエストボディのパースに失敗しました。');
  }

  const b = body as BatchRequestBody;

  if (!Array.isArray(b?.items) || b.items.length === 0) {
    throw new ApiError(400, 'items は1件以上の配列が必要です。');
  }

  if (b.action !== 'approve' && b.action !== 'reject') {
    throw new ApiError(400, 'action は "approve" または "reject" のみ有効です。');
  }

  // 上限チェック
  if (b.items.length > 50) {
    throw new ApiError(400, '一括処理は50件までです。');
  }

  // ----- 各アスリートの WORM ログ作成 -----
  const results: BatchResult[] = [];
  const errors: Array<{ athleteId: string; error: string }> = [];

  for (const item of b.items) {
    if (!item.athleteId || typeof item.athleteId !== 'string') {
      errors.push({ athleteId: item.athleteId ?? '(不明)', error: 'athleteId が不正です。' });
      continue;
    }

    // アスリートアクセス確認（RLS）
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('id')
      .eq('id', item.athleteId)
      .single();

    if (athleteError || !athlete) {
      errors.push({
        athleteId: item.athleteId,
        error: '指定されたアスリートが見つからないか、アクセス権がありません。',
      });
      continue;
    }

    try {
      const entry = await createAuditEntry(supabase, {
        orgId: staff.org_id as string,
        staffId: staff.id as string,
        athleteId: item.athleteId,
        action: b.action,
        evidenceText: item.evidenceText || `一括${b.action === 'approve' ? '承認' : '却下'}`,
        ...(item.nlgText !== undefined && { nlgText: item.nlgText }),
        ...(item.riskScore !== undefined && { riskScore: item.riskScore }),
        diagnosisContext: { batchAction: true, riskLevel: 'normal' },
      });

      results.push({
        athleteId: item.athleteId,
        auditId: entry.id,
        timestamp: entry.created_at,
      });
    } catch (err) {
      errors.push({
        athleteId: item.athleteId,
        error: `WORM ログ作成失敗: ${err instanceof Error ? err.message : '不明なエラー'}`,
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      processed: results.length,
      failed: errors.length,
      results,
      errors,
    },
  });
}, { service: 'approval' });
