/**
 * PACE Platform — 承認監査ログ API
 *
 * POST /api/approval — 承認アクションを WORM 監査ログに記録
 * GET  /api/approval — アスリートの承認履歴を取得
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAuditEntry, type AuditEntry } from '@/lib/audit/worm';
import { withApiHandler, ApiError } from '@/lib/api/handler';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ApprovalRequestBody {
  athleteId: string;
  action: 'approve' | 'edit_approve' | 'reject';
  menuJson?: unknown;
  evidenceText: string;
  nlgText?: string;
  riskScore?: number;
  diagnosisContext?: unknown;
  /** M20: P1(critical)/P2(watchlist) は AT/PT のみ承認可 */
  riskLevel?: 'critical' | 'watchlist' | 'normal';
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

const VALID_ACTIONS = ['approve', 'edit_approve', 'reject'] as const;

function validateApprovalBody(body: unknown): body is ApprovalRequestBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;

  return (
    typeof b.athleteId === 'string' &&
    b.athleteId.length > 0 &&
    typeof b.action === 'string' &&
    VALID_ACTIONS.includes(b.action as (typeof VALID_ACTIONS)[number]) &&
    typeof b.evidenceText === 'string' &&
    b.evidenceText.length > 0 &&
    (b.nlgText === undefined || typeof b.nlgText === 'string') &&
    (b.riskScore === undefined || typeof b.riskScore === 'number') &&
    (b.menuJson === undefined || b.menuJson !== null) &&
    (b.diagnosisContext === undefined || b.diagnosisContext !== null)
  );
}

// ---------------------------------------------------------------------------
// POST /api/approval
// ---------------------------------------------------------------------------

export const POST = withApiHandler(async (req, _ctx) => {
  // ----- 認証チェック -----
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。ログインしてください。');
  }

  // ----- スタッフ情報取得（AT, PT, master のみ許可）-----
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

  // ----- リクエストボディのパースとバリデーション -----
  let body: unknown;
  try {
    body = await req.json() as unknown;
  } catch {
    throw new ApiError(400, 'リクエストボディのJSONパースに失敗しました。');
  }

  if (!validateApprovalBody(body)) {
    throw new ApiError(
      400,
      '入力データが不正です。athleteId (文字列), action ("approve"|"edit_approve"|"reject"), evidenceText (文字列) は必須です。',
    );
  }

  // ----- M20: P1/P2 は AT/PT のみ承認可（master は管理者であり臨床有資格者ではない） -----
  const typedBody = body as ApprovalRequestBody;
  if (
    (typedBody.riskLevel === 'critical' || typedBody.riskLevel === 'watchlist') &&
    body !== null && typeof body === 'object'
  ) {
    const qualifiedRoles = ['AT', 'PT'];
    if (!qualifiedRoles.includes(staff.role as string)) {
      throw new ApiError(
        403,
        'P1/P2 リスク推奨の承認はAT（アスレティックトレーナー）またはPT（理学療法士）のみ実施できます。',
      );
    }
  }

  // ----- アスリート存在・アクセス確認 (RLS) -----
  const { data: athlete, error: athleteError } = await supabase
    .from('athletes')
    .select('id, org_id')
    .eq('id', body.athleteId)
    .single();

  if (athleteError || !athlete) {
    throw new ApiError(403, '指定されたアスリートが見つからないか、アクセス権がありません。');
  }

  // ----- WORM 監査エントリ作成 -----
  const auditParams: import('@/lib/audit/worm').AuditEntryParams = {
    orgId: staff.org_id as string,
    staffId: staff.id as string,
    athleteId: body.athleteId,
    action: body.action,
    evidenceText: body.evidenceText,
  };
  if (body.menuJson !== undefined) auditParams.menuJson = body.menuJson;
  if (body.nlgText !== undefined) auditParams.nlgText = body.nlgText;
  if (body.riskScore !== undefined) auditParams.riskScore = body.riskScore;
  if (body.diagnosisContext !== undefined) auditParams.diagnosisContext = body.diagnosisContext;
  // M20: riskLevel を監査コンテキストに含める
  if (body.riskLevel !== undefined) {
    auditParams.diagnosisContext = {
      ...(auditParams.diagnosisContext as Record<string, unknown> ?? {}),
      riskLevel: body.riskLevel,
    };
  }

  const entry = await createAuditEntry(supabase, auditParams);

  return NextResponse.json({
    success: true,
    data: {
      auditId: entry.id,
      timestamp: entry.created_at,
      dataHash: entry.data_hash,
    },
  });
}, { service: 'approval' });

// ---------------------------------------------------------------------------
// GET /api/approval
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (req, ctx) => {
  // ----- 認証チェック -----
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。ログインしてください。');
  }

  // ----- クエリパラメータ解析 -----
  const { searchParams } = new URL(req.url);
  const athleteId = searchParams.get('athleteId');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10), 1), 200);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

  if (!athleteId) {
    throw new ApiError(400, 'クエリパラメータ athleteId は必須です。');
  }

  // ----- 監査ログ取得 -----
  const { data, error, count } = await supabase
    .from('approval_audit_logs')
    .select('*', { count: 'exact' })
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    ctx.log.error('監査ログ取得エラー', { detail: error });
    throw new ApiError(500, '監査ログの取得に失敗しました。');
  }

  return NextResponse.json({
    success: true,
    data: (data ?? []) as AuditEntry[],
    total: count ?? 0,
  });
}, { service: 'approval' });
