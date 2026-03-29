/**
 * POST /api/assessment/nodes/import
 * ============================================================
 * Assessment Nodes CSV インポート API（M7）
 *
 * mode=preview : DB書き込みなし、バリデーション結果のみ返す
 * mode=commit  : バリデーション後、DB に upsert する（AT/PT/master のみ）
 *
 * リクエスト: multipart/form-data
 *   file              : CSV ファイル（必須）
 *   mode              : "preview" | "commit"（デフォルト: "preview"）
 *   conflictResolution: "skip" | "update"（デフォルト: "skip"）
 * ============================================================
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseAssessmentNodesCsv } from '@/lib/assessment/csv-parser';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 2000;
const ALLOWED_ROLES = ['AT', 'PT', 'master'];

export async function POST(request: Request) {
  try {
    // ----- 認証チェック -----
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。' },
        { status: 401 },
      );
    }

    // ----- スタッフ権限チェック -----
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, org_id, role')
      .eq('id', user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフ情報が見つかりません。' },
        { status: 403 },
      );
    }

    if (!ALLOWED_ROLES.includes(staff.role as string)) {
      return NextResponse.json(
        { success: false, error: 'このAPIにはAT、PT、またはmaster権限が必要です。' },
        { status: 403 },
      );
    }

    // ----- フォームデータ取得 -----
    const formData = await request.formData();
    const file = formData.get('file');
    const mode = (formData.get('mode') as string | null) ?? 'preview';
    const conflictResolution = (formData.get('conflictResolution') as string | null) ?? 'skip';

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'CSVファイルが見つかりません。' },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'ファイルサイズは5MB以下にしてください。' },
        { status: 400 },
      );
    }

    // ----- CSV パース & バリデーション -----
    const csvText = await file.text();
    const { nodes, errors, totalRows } = parseAssessmentNodesCsv(csvText);

    if (totalRows > MAX_ROWS) {
      return NextResponse.json(
        { success: false, error: `一度にインポートできるのは${MAX_ROWS}行までです。` },
        { status: 400 },
      );
    }

    // preview モードはここで返す
    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        mode: 'preview',
        summary: {
          totalRows,
          validNodes: nodes.length,
          invalidRows: errors.length,
        },
        nodes: nodes.slice(0, 50), // プレビューは最大50件
        errors,
      });
    }

    // ----- commit モード: DB upsert -----
    if (nodes.length === 0) {
      return NextResponse.json(
        { success: false, error: '有効なノードが0件のため、インポートできません。' },
        { status: 400 },
      );
    }

    // 既存 node_id の確認
    const nodeIds = nodes.map((n) => n.node_id);
    const { data: existingRows } = await supabase
      .from('assessment_nodes')
      .select('node_id')
      .in('node_id', nodeIds);

    const existingIds = new Set((existingRows ?? []).map((r) => r.node_id as string));

    const toInsert = nodes.filter((n) =>
      conflictResolution === 'update' ? true : !existingIds.has(n.node_id)
    );
    const skippedCount = nodes.length - toInsert.length;

    if (toInsert.length === 0) {
      return NextResponse.json({
        success: true,
        mode: 'commit',
        imported: 0,
        skipped: skippedCount,
        errors,
        summary: { totalRows, validNodes: nodes.length, invalidRows: errors.length },
      });
    }

    // DB 行にマッピング
    const dbRows = toInsert.map((n) => ({
      node_id: n.node_id,
      file_type: n.file_type.toLowerCase().replace(/(\d)/, '_$1') as string, // F1→f1_acute 変換は不要、DB の enum を確認
      phase: n.phase,
      category: n.category,
      question_text: n.question_text,
      target_axis: n.target_axis,
      lr_yes: n.lr_yes,
      lr_no: n.lr_no,
      kappa: n.kappa,
      prescription_tags: n.prescription_tags,
      contraindication_tags: n.contraindication_tags,
      time_decay_lambda: n.time_decay_lambda,
      base_prevalence: n.base_prevalence,
      ...(n.information_gain !== null ? { information_gain: n.information_gain } : {}),
      sort_order: n.sort_order,
      ...(n.mutual_exclusive_group ? { mutual_exclusive_group: n.mutual_exclusive_group } : {}),
      ...(n.routing_rules ? { routing_rules: n.routing_rules } : {}),
    }));

    const { error: upsertError } = await supabase
      .from('assessment_nodes')
      .upsert(dbRows, { onConflict: 'node_id', ignoreDuplicates: conflictResolution === 'skip' });

    if (upsertError) {
      console.error('[assessment/nodes/import] upsert エラー:', upsertError);
      return NextResponse.json(
        { success: false, error: `DBへの書き込みに失敗しました: ${upsertError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      mode: 'commit',
      imported: toInsert.length,
      skipped: skippedCount,
      errors,
      summary: {
        totalRows,
        validNodes: nodes.length,
        invalidRows: errors.length,
      },
    });
  } catch (err) {
    console.error('[assessment/nodes/import] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}
