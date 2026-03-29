/**
 * PACE Platform — 承認監査ログ API
 *
 * POST /api/approval — 承認アクションを WORM 監査ログに記録
 * GET  /api/approval — アスリートの承認履歴を取得
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAuditEntry, type AuditEntry } from '@/lib/audit/worm';

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

interface ApprovalResponse {
  success: true;
  data: {
    auditId: string;
    timestamp: string;
    dataHash: string;
  };
}

interface ApprovalHistoryResponse {
  success: true;
  data: AuditEntry[];
  total: number;
}

interface ErrorResponse {
  success: false;
  error: string;
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

export async function POST(
  request: Request
): Promise<NextResponse<ApprovalResponse | ErrorResponse>> {
  try {
    // ----- 認証チェック -----
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // ----- スタッフ情報取得（AT, PT, master のみ許可）-----
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, org_id, role')
      .eq('id', user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフ情報が見つかりません。' },
        { status: 403 }
      );
    }

    const allowedRoles = ['AT', 'PT', 'master'];
    if (!allowedRoles.includes(staff.role as string)) {
      return NextResponse.json(
        { success: false, error: 'この操作にはAT、PT、またはmaster権限が必要です。' },
        { status: 403 }
      );
    }

    // ----- リクエストボディのパースとバリデーション -----
    let body: unknown;
    try {
      body = await request.json() as unknown;
    } catch {
      return NextResponse.json(
        { success: false, error: 'リクエストボディのJSONパースに失敗しました。' },
        { status: 400 }
      );
    }

    if (!validateApprovalBody(body)) {
      return NextResponse.json(
        {
          success: false,
          error:
            '入力データが不正です。athleteId (文字列), action ("approve"|"edit_approve"|"reject"), evidenceText (文字列) は必須です。',
        },
        { status: 400 }
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
        return NextResponse.json(
          {
            success: false,
            error:
              'P1/P2 リスク推奨の承認はAT（アスレティックトレーナー）またはPT（理学療法士）のみ実施できます。',
          },
          { status: 403 }
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
      return NextResponse.json(
        { success: false, error: '指定されたアスリートが見つからないか、アクセス権がありません。' },
        { status: 403 }
      );
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
  } catch (err) {
    console.error('[approval] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/approval
// ---------------------------------------------------------------------------

export async function GET(
  request: Request
): Promise<NextResponse<ApprovalHistoryResponse | ErrorResponse>> {
  try {
    // ----- 認証チェック -----
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // ----- クエリパラメータ解析 -----
    const { searchParams } = new URL(request.url);
    const athleteId = searchParams.get('athleteId');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10), 1), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

    if (!athleteId) {
      return NextResponse.json(
        { success: false, error: 'クエリパラメータ athleteId は必須です。' },
        { status: 400 }
      );
    }

    // ----- 監査ログ取得 -----
    const { data, error, count } = await supabase
      .from('approval_audit_logs')
      .select('*', { count: 'exact' })
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[approval] 監査ログ取得エラー:', error);
      return NextResponse.json(
        { success: false, error: '監査ログの取得に失敗しました。' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: (data ?? []) as AuditEntry[],
      total: count ?? 0,
    });
  } catch (err) {
    console.error('[approval] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 }
    );
  }
}
