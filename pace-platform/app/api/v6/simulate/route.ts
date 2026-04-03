/**
 * PACE Platform — v6 What-If シミュレーション API
 *
 * POST /api/v6/simulate
 * Body: {
 *   athleteId: string,
 *   loadPercent: number,       // 0-150 (current load = 100)
 *   excludeSprints: boolean,
 *   applyTaping: boolean,
 *   switchToLowIntensity: boolean,
 * }
 *
 * Returns:
 *   predictedDamage — 各組織の予測ダメージ（0-100）
 *   marginToCritical — 臨界点までの余裕（0-100）
 *   riskBefore / riskAfter — RED/ORANGE/YELLOW/GREEN
 *   evidenceMessage — 日本語メッセージ
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';
import { sanitizeUserInput } from '@/lib/shared/security-helpers';
import { withApiHandler, ApiError } from '@/lib/api/handler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SimulateRequest {
  athleteId: string;
  loadPercent: number;
  excludeSprints: boolean;
  applyTaping: boolean;
  switchToLowIntensity: boolean;
}

interface SimulateResponse {
  success: true;
  data: {
    predictedDamage: Record<string, number>;
    marginToCritical: number;
    riskBefore: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';
    riskAfter: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';
    evidenceMessage: string;
  };
}

interface ErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

function classifyRisk(maxDamage: number): 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' {
  if (maxDamage >= 80) return 'RED';
  if (maxDamage >= 60) return 'ORANGE';
  if (maxDamage >= 40) return 'YELLOW';
  return 'GREEN';
}

// ---------------------------------------------------------------------------
// POST /api/v6/simulate
// ---------------------------------------------------------------------------

export const POST = withApiHandler(async (request, _ctx) => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。');
  }

  const body = (await request.json()) as SimulateRequest;

  const athleteId = sanitizeUserInput(String(body.athleteId ?? ''));
  if (!athleteId || !validateUUID(athleteId)) {
    throw new ApiError(400, 'athleteId が不正です。');
  }

  const loadPercent = Math.max(0, Math.min(200, Number(body.loadPercent ?? 100)));
  const excludeSprints = Boolean(body.excludeSprints);
  const applyTaping = Boolean(body.applyTaping);
  const switchToLowIntensity = Boolean(body.switchToLowIntensity);

  // Fetch current athlete metrics
  const { data: athlete, error: athleteError } = await supabase
    .from('athletes')
    .select('id, name')
    .eq('id', athleteId)
    .single();

  if (athleteError || !athlete) {
    throw new ApiError(403, 'アスリートが見つかりません。');
  }

  const today = new Date().toISOString().split('T')[0]!;
  const { data: latestMetrics } = await supabase
    .from('daily_metrics')
    .select('conditioning_score, acwr, fitness_ewma, fatigue_ewma, nrs')
    .eq('athlete_id', athleteId)
    .lte('date', today)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const conditioningScore = (latestMetrics?.conditioning_score as number | null) ?? 60;
  const acwr = (latestMetrics?.acwr as number | null) ?? 1.0;
  const fitnessEwma = (latestMetrics?.fitness_ewma as number | null) ?? 50;
  const fatigueEwma = (latestMetrics?.fatigue_ewma as number | null) ?? 40;

  // Compute "before" damage from current state
  const baseMaxDamage = Math.max(0, 100 - conditioningScore);
  const acwrDamageContrib = acwr > 1.0 ? (acwr - 1.0) * 60 : 0;
  const beforeDamage: Record<string, number> = {
    left_hamstring: Math.min(100, baseMaxDamage * 0.7 + acwrDamageContrib * 0.5),
    right_hamstring: Math.min(100, baseMaxDamage * 0.6 + acwrDamageContrib * 0.4),
    left_knee: Math.min(100, baseMaxDamage * 0.5 + acwrDamageContrib * 0.6),
    right_knee: Math.min(100, baseMaxDamage * 0.5 + acwrDamageContrib * 0.6),
    lower_back: Math.min(100, baseMaxDamage * 0.4 + acwrDamageContrib * 0.3),
    left_ankle: Math.min(100, baseMaxDamage * 0.3 + acwrDamageContrib * 0.4),
    right_ankle: Math.min(100, baseMaxDamage * 0.3 + acwrDamageContrib * 0.4),
  };

  // Compute intervention reduction factor
  const loadFactor = loadPercent / 100;
  let reductionFactor = 0;
  if (excludeSprints) reductionFactor += 0.15;
  if (applyTaping) reductionFactor += 0.05;
  if (switchToLowIntensity) reductionFactor += 0.25;

  // Predict damage after interventions
  const predictedDamage: Record<string, number> = {};
  for (const [region, damage] of Object.entries(beforeDamage)) {
    predictedDamage[region] = Math.max(
      0,
      Math.round(damage * loadFactor * (1 - reductionFactor)),
    );
  }

  const maxBefore = Math.max(...Object.values(beforeDamage), 0);
  const maxAfter = Math.max(...Object.values(predictedDamage), 0);
  const marginToCritical = Math.max(0, Math.round(100 - maxAfter));

  const riskBefore = classifyRisk(maxBefore);
  const riskAfter = classifyRisk(maxAfter);

  // Build evidence message (Japanese)
  const interventionTexts: string[] = [];
  if (excludeSprints) interventionTexts.push('スプリント除外');
  if (applyTaping) interventionTexts.push('テーピング適用');
  if (switchToLowIntensity) interventionTexts.push('低強度メニューに変更');

  const interventionStr =
    interventionTexts.length > 0
      ? `（介入: ${interventionTexts.join('、')}）`
      : '';

  const evidenceMessage = `負荷を${loadPercent}%に設定した場合${interventionStr}、予測最大組織ダメージは${Math.round(maxBefore)}% → ${Math.round(maxAfter)}%に変化します。臨界点（100%）までの余裕は${marginToCritical}%です。${riskAfter === 'RED' || riskAfter === 'ORANGE' ? 'リスクが高い状態が続くため、医療スタッフへの相談を推奨します。' : riskAfter === 'GREEN' ? '安全ゾーン内に収まっています。' : 'モニタリングを継続してください。'}`;

  return NextResponse.json({
    success: true,
    data: {
      predictedDamage,
      marginToCritical,
      riskBefore,
      riskAfter,
      evidenceMessage,
    },
  });
}, { service: 'v6-inference' });
