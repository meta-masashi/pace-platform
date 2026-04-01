/**
 * PACE Platform — AI リハビリメニュー生成 API
 *
 * POST /api/rehab/menu
 *
 * Gemini を使用してリハビリメニューを生成し、workouts テーブルに保存する。
 * exercises テーブルの contraindication_tags を適用する。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateRehabMenu,
  type GenerateRehabMenuInput,
} from "@/lib/gemini/rehab-generator";
import type {
  AthleteProfile,
  BayesianDiagnosisResult,
  CvKinematicsData,
} from "@/lib/gemini/context-injector";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface MenuRequestBody {
  programId: string;
  phase: number;
}

// ---------------------------------------------------------------------------
// POST /api/rehab/menu
// ---------------------------------------------------------------------------

/**
 * AI リハビリメニューを生成する。
 *
 * 1. プログラム・アスリート情報を取得
 * 2. アセスメント結果から診断情報を取得
 * 3. exercises テーブルから禁忌タグを収集
 * 4. Gemini で生成
 * 5. workouts テーブルに保存
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // ----- 認証チェック -----
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "認証が必要です。ログインしてください。" },
        { status: 401 }
      );
    }

    // ----- スタッフ権限確認 -----
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("id, org_id, role, name")
      .eq("id", user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: "スタッフプロファイルが見つかりません。" },
        { status: 403 }
      );
    }

    const allowedRoles = ["AT", "PT", "master"];
    if (!allowedRoles.includes(staff.role as string)) {
      return NextResponse.json(
        { success: false, error: "メニュー生成にはAT、PT、またはmaster権限が必要です。" },
        { status: 403 }
      );
    }

    // ----- リクエストボディ -----
    let body: MenuRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "リクエストボディのJSONパースに失敗しました。" },
        { status: 400 }
      );
    }

    if (!body.programId || typeof body.phase !== "number") {
      return NextResponse.json(
        { success: false, error: "programId と phase は必須です。" },
        { status: 400 }
      );
    }

    // ----- プログラム取得 -----
    const { data: program, error: programError } = await supabase
      .from("rehab_programs")
      .select(`
        id,
        athlete_id,
        org_id,
        diagnosis_code,
        current_phase,
        status,
        athletes ( id, name, position, age, sex, sport )
      `)
      .eq("id", body.programId)
      .eq("org_id", staff.org_id)
      .single();

    if (programError || !program) {
      return NextResponse.json(
        { success: false, error: "プログラムが見つからないか、アクセス権がありません。" },
        { status: 404 }
      );
    }

    // ----- 禁忌タグを収集（該当フェーズのエクササイズから） -----
    const { data: exercises } = await supabase
      .from("exercises")
      .select("contraindication_tags_json")
      .eq("phase", body.phase);

    const contraindicationTags: string[] = [];
    for (const ex of exercises ?? []) {
      const tags = ex.contraindication_tags_json as string[] | null;
      if (tags && Array.isArray(tags)) {
        for (const tag of tags) {
          if (!contraindicationTags.includes(tag)) {
            contraindicationTags.push(tag);
          }
        }
      }
    }

    // ----- アセスメント結果を取得（最新） -----
    const { data: assessmentResult } = await supabase
      .from("assessment_results")
      .select("primary_diagnosis, confidence, differentials, red_flags, contraindication_tags")
      .eq("session_id", body.programId) // 関連付けがある場合
      .single();

    // ----- ロック状態確認 -----
    const { data: hardLocks } = await supabase
      .from("athlete_locks")
      .select("id, lock_type")
      .eq("athlete_id", program.athlete_id)
      .eq("lock_type", "hard")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

    const hardLockActive = (hardLocks ?? []).length > 0;

    // ----- Gemini で生成 -----
    const athleteData = (typeof program.athletes === 'object' && program.athletes !== null) ? (program.athletes as unknown as Record<string, unknown>) : null;
    const sexValue = (athleteData?.sex as string) ?? "male";
    const profile: AthleteProfile = {
      id: program.athlete_id as string,
      name: (athleteData?.name as string) ?? "不明",
      age: (athleteData?.age as number) ?? 0,
      sex: sexValue === "female" ? "female" : "male",
      sport: (athleteData?.sport as string) ?? undefined,
      position: (athleteData?.position as string) ?? undefined,
    };

    const diagnosisHint = (assessmentResult?.primary_diagnosis as string) ?? (program.diagnosis_code as string) ?? "不明";

    const bayes: BayesianDiagnosisResult = {
      sessionId: body.programId,
      athleteId: program.athlete_id as string,
      assessmentType: "acute",
      topDiagnoses: [{
        label: diagnosisHint,
        posterior: (assessmentResult?.confidence as number) ?? 0.5,
        riskLevel: "medium",
      }],
      keyEvidenceNodes: [],
      contraindicationTags: [
        ...contraindicationTags,
        ...((assessmentResult?.contraindication_tags as string[]) ?? []),
      ],
      prescriptionTags: [],
      overallRiskLevel: "medium",
      hardLockActive,
      completedAt: new Date().toISOString(),
    };

    const input: GenerateRehabMenuInput = {
      profile,
      bayes,
      cv: null as CvKinematicsData | null,
      sessionId: body.programId,
      staffContext: {
        userId: staff.id as string,
        endpoint: "rehab-menu",
      },
    };

    const menu = await generateRehabMenu(input);

    // ----- workouts テーブルに保存 -----
    const { data: workout, error: workoutError } = await supabase
      .from("workouts")
      .insert({
        athlete_id: program.athlete_id,
        org_id: staff.org_id,
        generated_by_ai: true,
        menu_json: menu,
      })
      .select("id, generated_at")
      .single();

    if (workoutError) {
      console.error("[rehab:menu:POST] ワークアウト保存エラー:", workoutError);
      // 生成は成功しているのでメニューは返す
    }

    // ----- 監査ログ -----
    await supabase
      .from("audit_logs")
      .insert({
        user_id: user.id,
        action: "rehab_menu_generate",
        resource_type: "workout",
        resource_id: (workout?.id as string) ?? "unknown",
        details: {
          program_id: body.programId,
          phase: body.phase,
          athlete_id: program.athlete_id,
          exercise_count: menu.phases.reduce(
            (sum, p) => sum + p.exercises.length,
            0
          ),
        },
      })
      .then(({ error }) => {
        if (error) console.warn("[rehab:menu:POST] 監査ログ記録失敗:", error);
      });

    return NextResponse.json({
      success: true,
      data: {
        workoutId: workout?.id ?? null,
        menu,
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "不明なエラー";

    if (errorMessage.includes("HARD_LOCK_ACTIVE")) {
      return NextResponse.json(
        { success: false, error: "Hard Lock が有効です。医師の承認後に解除してください。" },
        { status: 403 }
      );
    }

    if (errorMessage.includes("RATE_LIMIT_EXCEEDED")) {
      return NextResponse.json(
        { success: false, error: "APIレート制限に達しました。しばらく待ってから再試行してください。" },
        { status: 429 }
      );
    }

    if (errorMessage.includes("GUARDRAIL_VIOLATION")) {
      return NextResponse.json(
        { success: false, error: "安全性ガードレール違反が検出されました。メニューを再生成してください。" },
        { status: 422 }
      );
    }

    console.error("[rehab:menu:POST] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}
