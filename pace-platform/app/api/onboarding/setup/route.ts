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
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 },
      );
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
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'リクエストボディのパースに失敗しました。' },
        { status: 400 },
      );
    }

    // バリデーション
    if (!body.organizationName?.trim()) {
      return NextResponse.json(
        { success: false, error: '組織名は必須です。' },
        { status: 400 },
      );
    }
    if (!body.sport?.trim()) {
      return NextResponse.json(
        { success: false, error: '競技種目は必須です。' },
        { status: 400 },
      );
    }
    if (!body.teamName?.trim()) {
      return NextResponse.json(
        { success: false, error: 'チーム名は必須です。' },
        { status: 400 },
      );
    }
    if (!body.athletes || body.athletes.length === 0) {
      return NextResponse.json(
        { success: false, error: '最低1名の選手が必要です。' },
        { status: 400 },
      );
    }
    if (body.athletes.length > 200) {
      return NextResponse.json(
        { success: false, error: '一度に登録できる選手は200名までです。' },
        { status: 400 },
      );
    }
    if (body.invites && body.invites.length > 50) {
      return NextResponse.json(
        { success: false, error: '一度に招待できるスタッフは50名までです。' },
        { status: 400 },
      );
    }

    // 1. 組織を作成
    // BUG-11 fix: sport を organizations テーブルに保存する
    const validSports = ['soccer', 'baseball', 'basketball', 'rugby', 'other'];
    const normalizedSport = validSports.includes(body.sport) ? body.sport : 'other';

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: body.organizationName.trim(),
        sport: normalizedSport,
        plan: 'standard',
      })
      .select('id')
      .single();

    if (orgError || !org) {
      console.error('[onboarding/setup] 組織作成エラー:', orgError);
      return NextResponse.json(
        { success: false, error: '組織の作成に失敗しました。' },
        { status: 500 },
      );
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
      console.error('[onboarding/setup] チーム作成エラー:', teamError);
      return NextResponse.json(
        { success: false, error: 'チームの作成に失敗しました。' },
        { status: 500 },
      );
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
      console.error('[onboarding/setup] スタッフ登録エラー:', staffError);
      return NextResponse.json(
        { success: false, error: 'スタッフの登録に失敗しました。' },
        { status: 500 },
      );
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
      console.error('[onboarding/setup] 選手登録エラー:', athletesError);
      return NextResponse.json(
        { success: false, error: '選手の登録に失敗しました。' },
        { status: 500 },
      );
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
          console.error('[onboarding/setup] 招待エラー:', inviteError);
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
  } catch (err) {
    console.error('[onboarding/setup] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}
