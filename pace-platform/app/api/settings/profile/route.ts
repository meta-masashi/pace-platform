import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// GET /api/settings/profile — 現在のユーザープロフィールを取得
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: '認証されていません' },
        { status: 401 }
      );
    }

    // staff テーブルからプロフィール情報を取得
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, name, role, org_id')
      .eq('id', user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { error: 'スタッフ情報が見つかりません' },
        { status: 404 }
      );
    }

    // 組織（チーム）名を取得
    let teamName = '';
    if (staff.org_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', staff.org_id)
        .single();
      teamName = org?.name ?? '';
    }

    return NextResponse.json({
      id: staff.id,
      name: staff.name,
      email: user.email,
      role: staff.role,
      teamName,
    });
  } catch {
    return NextResponse.json(
      { error: 'プロフィールの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/settings/profile — プロフィール更新（名前のみ）
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: '認証されていません' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: '名前は必須です' },
        { status: 400 }
      );
    }

    if (name.trim().length > 100) {
      return NextResponse.json(
        { error: '名前は100文字以内で入力してください' },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from('staff')
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json(
        { error: 'プロフィールの更新に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, name: name.trim() });
  } catch {
    return NextResponse.json(
      { error: 'プロフィールの更新に失敗しました' },
      { status: 500 }
    );
  }
}
