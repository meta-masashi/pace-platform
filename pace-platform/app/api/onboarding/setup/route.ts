/**
 * POST /api/onboarding/setup
 *
 * 初回セットアップ: 組織・チーム・選手の一括登録。
 * 招待メール送信（オプション）。
 *
 * Body: {
 *   organizationName: string,
 *   sport: string,
 *   teamName: string,
 *   athletes: Array<{ name: string, position?: string, number?: number }>,
 *   invites?: Array<{ email: string, role: 'AT' | 'PT' | 'S&C' }>
 * }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiHandler, ApiError } from '@/lib/api/handler';

export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();

  // 認証チェック
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。ログインしてください。');
  }

  // リクエストボディのパース
  let body: {
    organizationName: string;
    sport: string;
    teamName: string;
    athletes: Array<{ name: string; position?: string | null; number?: number | null }>;
    invites?: Array<{ email: string; role: 'AT' | 'PT' | 'S&C' }>;
  };

  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'リクエストボディのパースに失敗しました。');
  }

  // バリデーション
  if (!body.organizationName?.trim()) {
    throw new ApiError(400, '組織名は必須です。');
  }
  if (!body.sport?.trim()) {
    throw new ApiError(400, '競技種目は必須です。');
  }
  if (!body.teamName?.trim()) {
    throw new ApiError(400, 'チーム名は必須です。');
  }
  if (!body.athletes || body.athletes.length === 0) {
    throw new ApiError(400, '最低1名の選手が必要です。');
  }

  // 1. 組織を作成
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: body.organizationName.trim(),
      plan: 'standard',
    })
    .select('id')
    .single();

  if (orgError || !org) {
    ctx.log.error('組織作成エラー', { detail: orgError });
    throw new ApiError(500, '組織の作成に失敗しました。');
  }

  // 2. チームを作成
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert({
      org_id: org.id,
      name: body.teamName.trim(),
    })
    .select('id')
    .single();

  if (teamError || !team) {
    ctx.log.error('チーム作成エラー', { detail: teamError });
    throw new ApiError(500, 'チームの作成に失敗しました。');
  }

  // 3. 現在のユーザーを master スタッフとして登録
  const { error: staffError } = await supabase.from('staff').upsert(
    {
      id: user.id,
      org_id: org.id,
      team_id: team.id,
      name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'マスター',
      email: user.email!,
      role: 'master',
      is_leader: true,
    },
    { onConflict: 'id' },
  );

  if (staffError) {
    ctx.log.error('スタッフ登録エラー', { detail: staffError });
    throw new ApiError(500, 'スタッフの登録に失敗しました。');
  }

  // 4. 選手を一括登録
  const athleteRows = body.athletes.map((a) => ({
    org_id: org.id,
    team_id: team.id,
    name: a.name.trim(),
    position: a.position ?? null,
    number: a.number ?? null,
    sport: body.sport,
  }));

  const { error: athletesError } = await supabase
    .from('athletes')
    .insert(athleteRows);

  if (athletesError) {
    ctx.log.error('選手登録エラー', { detail: athletesError });
    throw new ApiError(500, '選手の登録に失敗しました。');
  }

  // 5. スタッフ招待（オプション）
  if (body.invites && body.invites.length > 0) {
    const validRoles = ['AT', 'PT', 'S&C'];
    const inviteRows = body.invites
      .filter((inv) => inv.email && validRoles.includes(inv.role))
      .map((inv) => ({
        org_id: org.id,
        team_id: team.id,
        email: inv.email.trim(),
        role: inv.role,
        name: inv.email.split('@')[0],
        is_active: false, // 招待済み・未確認
      }));

    if (inviteRows.length > 0) {
      const { error: inviteError } = await supabase
        .from('staff')
        .insert(inviteRows);

      if (inviteError) {
        // 招待失敗はノンブロッキング（ログのみ）
        ctx.log.error('招待エラー', { detail: inviteError });
      }
    }
  }

  // 6. デフォルトチャンネル作成（community テーブルが存在する場合）
  try {
    await supabase.from('channels').insert([
      {
        org_id: org.id,
        team_id: team.id,
        name: 'general',
        description: 'チーム全体の連絡用',
        created_by: user.id,
      },
      {
        org_id: org.id,
        team_id: team.id,
        name: 'medical',
        description: 'メディカルスタッフ用',
        created_by: user.id,
      },
    ]);
  } catch {
    // channels テーブルが存在しない場合はスキップ
  }

  return NextResponse.json(
    {
      success: true,
      data: { orgId: org.id, teamId: team.id },
    },
    { status: 201 },
  );
}, { service: 'onboarding' });
