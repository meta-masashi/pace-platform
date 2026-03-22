import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

// Movement types and their analysis criteria
const MOVEMENT_PROMPTS: Record<string, string> = {
  squat: "片脚スクワットまたは両脚スクワット",
  hop: "シングルレッグホップ（前方・側方・斜め方向）",
  sprint: "スプリント・加速動作",
  cutting: "カッティング動作・方向転換",
  landing: "着地動作・ドロップジャンプ",
  general: "一般的なスポーツ動作",
};

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit
    const rl = await checkRateLimit(user.id, "ai");
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await req.json();
    const { videoBase64, mimeType, movementType, athleteName, athletePosition } = body;

    // Validate
    if (!videoBase64 || !mimeType) {
      return NextResponse.json({ error: "video data required" }, { status: 400 });
    }

    // Max ~4MB base64 (3MB raw video)
    if (videoBase64.length > 5_500_000) {
      return NextResponse.json({ error: "Video too large. Please use a clip under 30 seconds." }, { status: 413 });
    }

    const movementLabel = MOVEMENT_PROMPTS[movementType] ?? MOVEMENT_PROMPTS.general;

    const prompt = `あなたはスポーツ医科学の専門家（アスレティックトレーナー/理学療法士）として、以下の動画を評価してください。

選手情報: ${athleteName ?? "不明"} / ${athletePosition ?? "不明"}
評価動作: ${movementLabel}

【評価項目】
以下の項目を1〜5点（1=著しく不良、3=標準、5=優秀）で採点し、具体的な所見を記述してください。

1. 着地・接地メカニクス（膝の過度な内反/外反、足部の接地角度）
2. 体幹安定性（体幹の側屈・回旋・前傾の程度）
3. 関節可動域（股関節・膝関節・足関節の屈曲伸展角度の目視推定）
4. 動作の左右対称性（左右の動きのバランス）
5. 全体的な動作品質（スムーズさ・コントロール）

【出力形式】
必ずJSON形式で以下を返してください:
{
  "scores": {
    "landing": <1-5>,
    "coreStability": <1-5>,
    "rangeOfMotion": <1-5>,
    "symmetry": <1-5>,
    "overallQuality": <1-5>
  },
  "overallScore": <1-5の平均>,
  "riskLevel": "low" | "moderate" | "high",
  "findings": [
    "<具体的な所見1（日本語）>",
    "<具体的な所見2>",
    "<具体的な所見3>"
  ],
  "recommendations": [
    "<改善推奨事項1（日本語）>",
    "<改善推奨事項2>"
  ],
  "objectiveNote": "<SOAPのO欄に直接転記できる1〜3文の客観所見（日本語）>"
}

動画が不鮮明・短すぎる・動作が確認できない場合は、確認できた範囲のみ評価し、不明な項目はスコア3・所見「評価困難」としてください。`;

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: videoBase64,
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
          }
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error("[video-analysis] Gemini error:", err);
      return NextResponse.json({ error: "AI analysis failed" }, { status: 502 });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Parse JSON from the response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse AI response", raw: rawText }, { status: 502 });
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: "Invalid AI response format", raw: rawText }, { status: 502 });
    }

    return NextResponse.json({
      analysis,
      movementType,
      analyzedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error("[video-analysis] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
