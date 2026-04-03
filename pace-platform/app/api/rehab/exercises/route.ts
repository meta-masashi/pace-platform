/**
 * GET /api/rehab/exercises
 *
 * リハビリ種目マスタの取得。
 * フィルタリング: category, target_tissue, intensity_level, min_phase, sport_tag
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // 認証チェック
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。' },
        { status: 401 },
      );
    }

    // スタッフ確認
    const { data: staff } = await supabase
      .from('staff')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフプロファイルが見つかりません。' },
        { status: 403 },
      );
    }

    // クエリパラメータ
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const targetTissue = url.searchParams.get('target_tissue');
    const intensityLevel = url.searchParams.get('intensity_level');
    const minPhase = url.searchParams.get('min_phase');
    const sportTag = url.searchParams.get('sport');

    // クエリ構築
    let query = supabase
      .from('rehab_exercises')
      .select('id, name, name_en, category, target_tissue, intensity_level, tissue_load, expected_effect, min_phase, contraindications, sport_tags, description')
      .order('min_phase', { ascending: true })
      .order('intensity_level', { ascending: true })
      .order('name', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }
    if (targetTissue) {
      query = query.eq('target_tissue', targetTissue);
    }
    if (intensityLevel) {
      query = query.eq('intensity_level', intensityLevel);
    }
    if (minPhase) {
      const phase = parseInt(minPhase, 10);
      if (!isNaN(phase) && phase >= 1 && phase <= 4) {
        query = query.lte('min_phase', phase);
      }
    }
    if (sportTag) {
      query = query.contains('sport_tags', [sportTag]);
    }

    const { data: exercises, error } = await query;

    if (error) {
      console.error('[rehab/exercises:GET] クエリエラー:', error);
      return NextResponse.json(
        { success: false, error: 'リハビリ種目の取得に失敗しました。' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        exercises: (exercises ?? []).map((ex) => ({
          id: ex.id,
          name: ex.name,
          nameEn: ex.name_en,
          category: ex.category,
          targetTissue: ex.target_tissue,
          intensityLevel: ex.intensity_level,
          tissueLoad: ex.tissue_load,
          expectedEffect: ex.expected_effect,
          minPhase: ex.min_phase,
          contraindications: ex.contraindications,
          sportTags: ex.sport_tags,
          description: ex.description,
        })),
        total: (exercises ?? []).length,
      },
    });
  } catch (err) {
    console.error('[rehab/exercises:GET] エラー:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'リハビリ種目の取得に失敗しました。',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
