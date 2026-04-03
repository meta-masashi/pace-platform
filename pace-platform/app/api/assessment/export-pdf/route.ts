/**
 * POST /api/assessment/export-pdf
 *
 * アセスメント PDF エクスポート API（Pro プラン以上）
 *
 * コンディショニングまたはリハビリのアセスメントデータを
 * 印刷可能な HTML ドキュメントとして生成する。
 * ブラウザの window.print() で PDF 変換可能。
 *
 * feature_ai_soap ゲート（Pro 以上）で保護。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';
import { canAccess } from '@/lib/billing/plan-gates';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ExportPdfRequest {
  athleteId: string;
  assessmentType: 'conditioning' | 'rehab';
  includeCharts: boolean;
  includeSoap: boolean;
}

interface SoapNote {
  id: string;
  s_text: string;
  o_text: string;
  a_text: string;
  p_text: string;
  created_at: string;
  ai_assisted: boolean;
}

// ---------------------------------------------------------------------------
// HTML ユーティリティ
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// リスク・ステータス判定ヘルパー
// ---------------------------------------------------------------------------

function acwrZone(acwr: number): { label: string; color: string } {
  if (acwr >= 0.8 && acwr <= 1.3) return { label: 'Optimal', color: '#22c55e' };
  if (acwr > 1.3 && acwr <= 1.5) return { label: 'Caution', color: '#f59e0b' };
  if (acwr > 1.5) return { label: 'Danger', color: '#dc2626' };
  return { label: 'Under-load', color: '#3b82f6' };
}

function riskBadge(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'High Risk', color: '#dc2626' };
  if (score >= 40) return { label: 'Moderate', color: '#f59e0b' };
  return { label: 'Low Risk', color: '#22c55e' };
}

function efficiencyBadge(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'Good', color: '#22c55e' };
  if (score >= 40) return { label: 'Fair', color: '#f59e0b' };
  return { label: 'Poor', color: '#dc2626' };
}

// ---------------------------------------------------------------------------
// 共通スタイルシート（インライン、A4 印刷対応）
// ---------------------------------------------------------------------------

function baseStyles(): string {
  return `<style>
  @page { size: A4; margin: 15mm 15mm 20mm 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif;
    font-size: 10pt; line-height: 1.6; color: #1a1a1a; background: #fff;
  }
  .page { width: 210mm; min-height: 297mm; padding: 15mm; margin: 0 auto; background: #fff; }
  @media print {
    .page { padding: 0; margin: 0; width: 100%; min-height: auto; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 16pt; font-weight: 700; color: #1e3a5f; margin-top: 4px; }
  .header .meta { text-align: right; font-size: 9pt; color: #666; }
  .header .logo { font-size: 11pt; font-weight: 700; color: #1e3a5f; letter-spacing: 2px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 12pt; font-weight: 700; color: #1e3a5f; border-left: 4px solid #1e3a5f; padding-left: 8px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 12px; }
  th { background: #f0f4f8; color: #1e3a5f; font-weight: 600; text-align: left; padding: 6px 8px; border: 1px solid #d1d5db; }
  td { padding: 5px 8px; border: 1px solid #d1d5db; vertical-align: top; }
  tr:nth-child(even) { background: #fafbfc; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 8pt; font-weight: 600; color: #fff; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .kpi-card { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px; text-align: center; }
  .kpi-card .label { font-size: 8pt; color: #666; margin-bottom: 2px; }
  .kpi-card .value { font-size: 16pt; font-weight: 700; }
  .kpi-card .sub { font-size: 8pt; color: #888; margin-top: 2px; }
  .soap-section { margin-bottom: 8px; }
  .soap-label { font-weight: 700; color: #1e3a5f; font-size: 9pt; margin-bottom: 2px; }
  .soap-content { background: #f9fafb; border-left: 3px solid #d1d5db; padding: 6px 10px; font-size: 9pt; white-space: pre-wrap; }
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #d1d5db; font-size: 8pt; color: #999; text-align: center; }
  .checklist-item { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 9pt; }
  .check-icon { width: 14px; height: 14px; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; }
  .check-met { background: #dcfce7; color: #16a34a; }
  .check-unmet { background: #fee2e2; color: #dc2626; }
  .pattern-list { list-style: disc; margin-left: 18px; font-size: 9pt; }
  .pattern-list li { margin-bottom: 4px; }
</style>`;
}

// ---------------------------------------------------------------------------
// セクション生成: コンディショニング
// ---------------------------------------------------------------------------

function renderConditioningHtml(
  athlete: { name: string; sport?: string; position?: string; number?: string },
  staffName: string,
  pipeline: { decision?: string; priority?: string; timestamp?: string } | null,
  loadAnalysis: Record<string, unknown>,
  efficiencyAnalysis: Record<string, unknown>,
  painAnalysis: Record<string, unknown>,
  soapNote: SoapNote | null,
  includeSoap: boolean,
  generatedAt: string,
): string {
  const now = formatDateTime(generatedAt);
  const athleteName = escapeHtml(athlete.name);
  const sportInfo = [athlete.sport, athlete.position, athlete.number ? `#${athlete.number}` : '']
    .filter(Boolean)
    .join(' / ');

  // --- Pipeline Decision Badge ---
  let pipelineBadgeHtml = '';
  if (pipeline) {
    const decision = (pipeline.decision as string) ?? 'unknown';
    const priority = (pipeline.priority as string) ?? 'normal';
    const decisionColors: Record<string, string> = {
      green: '#22c55e', yellow: '#f59e0b', orange: '#f97316', red: '#dc2626',
    };
    const bgColor = decisionColors[decision] ?? '#6b7280';
    pipelineBadgeHtml = `
      <div style="margin-bottom: 16px;">
        <span class="badge" style="background: ${bgColor}; font-size: 10pt; padding: 4px 14px;">
          Pipeline: ${escapeHtml(decision.toUpperCase())}
        </span>
        <span style="font-size: 9pt; color: #666; margin-left: 8px;">
          Priority: ${escapeHtml(priority)} | ${pipeline.timestamp ? formatDateTime(pipeline.timestamp as string) : ''}
        </span>
      </div>`;
  }

  // --- Load Analysis ---
  const acwr = (loadAnalysis.acwr as { current: number })?.current ?? 0;
  const az = acwrZone(acwr);
  const monotony = (loadAnalysis.monotony as { current: number })?.current ?? 0;
  const strain = (loadAnalysis.strain as number) ?? 0;
  const acuteLoad = (loadAnalysis.acuteLoad as number) ?? 0;
  const chronicLoad = (loadAnalysis.chronicLoad as number) ?? 0;
  const acuteChange = (loadAnalysis.acuteLoadChangePercent as number) ?? 0;
  const tissueDamage = (loadAnalysis.tissueDamage as Record<string, { value: number; halfLifeDays: number }>) ?? {};

  const tissueRows = Object.entries(tissueDamage)
    .map(([tissue, data]) => {
      const pct = Math.round(data.value * 100);
      const color = pct >= 70 ? '#dc2626' : pct >= 40 ? '#f59e0b' : '#22c55e';
      return `<tr><td>${escapeHtml(tissue)}</td><td style="text-align:center"><span style="color:${color};font-weight:600">${pct}%</span></td><td style="text-align:center">${data.halfLifeDays}d</td></tr>`;
    })
    .join('');

  const loadSection = `
    <div class="section">
      <div class="section-title">Load Analysis</div>
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="label">ACWR</div>
          <div class="value" style="color:${az.color}">${acwr.toFixed(2)}</div>
          <div class="sub">${az.label}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Monotony</div>
          <div class="value" style="color:${monotony > 2 ? '#dc2626' : monotony > 1.5 ? '#f59e0b' : '#1a1a1a'}">${monotony.toFixed(2)}</div>
          <div class="sub">${monotony > 2 ? 'High' : monotony > 1.5 ? 'Moderate' : 'Normal'}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Strain</div>
          <div class="value">${strain.toLocaleString()}</div>
          <div class="sub">Monotony x Weekly Load</div>
        </div>
        <div class="kpi-card">
          <div class="label">Acute / Chronic</div>
          <div class="value" style="font-size:13pt">${Math.round(acuteLoad)} / ${Math.round(chronicLoad)}</div>
          <div class="sub">${acuteChange >= 0 ? '+' : ''}${acuteChange}% WoW</div>
        </div>
      </div>
      ${tissueRows ? `<table><thead><tr><th>Tissue Type</th><th style="text-align:center">Accumulated Load</th><th style="text-align:center">Half-life</th></tr></thead><tbody>${tissueRows}</tbody></table>` : ''}
    </div>`;

  // --- Efficiency Analysis ---
  const decoupling = (efficiencyAnalysis.decoupling as { current: number })?.current ?? 0;
  const overallEfficiency = (efficiencyAnalysis.overallEfficiencyScore as number) ?? 0;
  const eb = efficiencyBadge(overallEfficiency);
  const zScores = (efficiencyAnalysis.zScores as Record<string, number>) ?? {};
  const zScoreAlertCount = (efficiencyAnalysis.zScoreAlertCount as number) ?? 0;

  const zScoreRows = Object.entries(zScores)
    .map(([key, val]) => {
      const color = val <= -1.5 ? '#dc2626' : val <= -1.0 ? '#f59e0b' : '#1a1a1a';
      return `<tr><td>${escapeHtml(key)}</td><td style="text-align:center;color:${color};font-weight:600">${val.toFixed(2)}</td></tr>`;
    })
    .join('');

  const efficiencySection = `
    <div class="section">
      <div class="section-title">Efficiency Analysis</div>
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="label">Decoupling</div>
          <div class="value" style="color:${decoupling > 1 ? '#dc2626' : '#1a1a1a'}">${decoupling.toFixed(2)}</div>
          <div class="sub">${decoupling > 1 ? 'Elevated' : 'Normal'}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Efficiency Score</div>
          <div class="value" style="color:${eb.color}">${overallEfficiency}</div>
          <div class="sub">${eb.label}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Z-Score Alerts</div>
          <div class="value" style="color:${zScoreAlertCount > 0 ? '#dc2626' : '#22c55e'}">${zScoreAlertCount}</div>
          <div class="sub">${zScoreAlertCount > 0 ? 'Below threshold' : 'All normal'}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Status</div>
          <div class="value" style="font-size:11pt;color:${eb.color}">${eb.label}</div>
          <div class="sub">Overall</div>
        </div>
      </div>
      ${zScoreRows ? `<table><thead><tr><th>Metric</th><th style="text-align:center">Z-Score</th></tr></thead><tbody>${zScoreRows}</tbody></table>` : ''}
    </div>`;

  // --- Pain Analysis ---
  const nrsCorrelation = (painAnalysis.nrsLoadCorrelation as number) ?? 0;
  const patterns = (painAnalysis.patterns as string[]) ?? [];
  const compensationAlert = (painAnalysis.compensationAlert as string) ?? null;
  const nrsTrend = (painAnalysis.nrsTrend as { date: string; nrs: number; srpe: number }[]) ?? [];
  const latestNrs = nrsTrend.length > 0 ? (nrsTrend[nrsTrend.length - 1]?.nrs ?? 0) : 0;
  const rb = riskBadge(Math.round(Math.abs(nrsCorrelation) * 100));

  let patternsHtml = '';
  if (patterns.length > 0 || compensationAlert) {
    const items = [...patterns];
    if (compensationAlert) items.push(compensationAlert);
    patternsHtml = `<ul class="pattern-list">${items.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`;
  }

  const painSection = `
    <div class="section">
      <div class="section-title">Pain Analysis</div>
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="label">Latest NRS</div>
          <div class="value" style="color:${latestNrs >= 5 ? '#dc2626' : latestNrs >= 3 ? '#f59e0b' : '#22c55e'}">${latestNrs}</div>
          <div class="sub">0-10 scale</div>
        </div>
        <div class="kpi-card">
          <div class="label">NRS-Load Correlation</div>
          <div class="value" style="color:${rb.color}">${nrsCorrelation.toFixed(2)}</div>
          <div class="sub">${rb.label}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Patterns Detected</div>
          <div class="value">${patterns.length}</div>
          <div class="sub">${patterns.length > 0 ? 'See below' : 'None'}</div>
        </div>
        <div class="kpi-card">
          <div class="label">Compensation Alert</div>
          <div class="value" style="font-size:11pt;color:${compensationAlert ? '#dc2626' : '#22c55e'}">${compensationAlert ? 'Yes' : 'No'}</div>
          <div class="sub">&nbsp;</div>
        </div>
      </div>
      ${patternsHtml}
    </div>`;

  // --- SOAP ---
  let soapSection = '';
  if (includeSoap && soapNote) {
    soapSection = renderSoapSection(soapNote);
  }

  // --- Assemble ---
  return buildDocument(
    'Conditioning Assessment Report',
    athleteName,
    sportInfo,
    staffName,
    now,
    `${pipelineBadgeHtml}${loadSection}${efficiencySection}${painSection}${soapSection}`,
    generatedAt,
  );
}

// ---------------------------------------------------------------------------
// セクション生成: リハビリ
// ---------------------------------------------------------------------------

function renderRehabHtml(
  athlete: { name: string; sport?: string; position?: string; number?: string },
  staffName: string,
  programs: Array<Record<string, unknown>>,
  soapNote: SoapNote | null,
  includeSoap: boolean,
  generatedAt: string,
): string {
  const now = formatDateTime(generatedAt);
  const athleteName = escapeHtml(athlete.name);
  const sportInfo = [athlete.sport, athlete.position, athlete.number ? `#${athlete.number}` : '']
    .filter(Boolean)
    .join(' / ');

  let programsHtml = '';

  for (const program of programs) {
    const diagnosis = (program.diagnosis as string) ?? 'N/A';
    const currentPhase = (program.currentPhase as number) ?? 1;
    const daysSinceInjury = (program.daysSinceInjury as number) ?? 0;
    const recoveryScore = (program.recoveryScore as number) ?? 0;
    const nrsImprovement = (program.nrsImprovement as number) ?? 0;
    const achievementRate = (program.achievementRate as number) ?? 0;
    const criteria = (program.criteria as Array<{ name: string; description: string; met: boolean; currentValue?: unknown; targetValue?: unknown }>) ?? [];
    const prescriptions = (program.prescriptions as Array<Record<string, unknown>>) ?? [];
    const injuryDate = (program.injuryDate as string) ?? '';

    const rsColor = recoveryScore >= 70 ? '#22c55e' : recoveryScore >= 40 ? '#f59e0b' : '#dc2626';

    // Program info
    const programInfoSection = `
      <div class="section">
        <div class="section-title">Program: ${escapeHtml(diagnosis)}</div>
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="label">Current Phase</div>
            <div class="value">${currentPhase} / 4</div>
            <div class="sub">${injuryDate ? `Since ${formatDate(injuryDate)}` : ''}</div>
          </div>
          <div class="kpi-card">
            <div class="label">Days Since Injury</div>
            <div class="value">${daysSinceInjury}</div>
            <div class="sub">days</div>
          </div>
          <div class="kpi-card">
            <div class="label">Recovery Score</div>
            <div class="value" style="color:${rsColor}">${recoveryScore}%</div>
            <div class="sub">Composite</div>
          </div>
          <div class="kpi-card">
            <div class="label">NRS Improvement</div>
            <div class="value" style="color:${nrsImprovement > 0 ? '#22c55e' : '#dc2626'}">${nrsImprovement > 0 ? '+' : ''}${nrsImprovement}%</div>
            <div class="sub">From baseline</div>
          </div>
        </div>
      </div>`;

    // Criteria checklist
    let criteriaSection = '';
    if (criteria.length > 0) {
      const criteriaItems = criteria
        .map((c) => {
          const icon = c.met
            ? '<span class="check-icon check-met">&#10003;</span>'
            : '<span class="check-icon check-unmet">&#10007;</span>';
          const valueInfo = c.targetValue != null
            ? ` (${c.currentValue ?? '?'} / ${c.targetValue})`
            : '';
          return `<div class="checklist-item">${icon}<span>${escapeHtml(String(c.name || c.description))}${valueInfo}</span></div>`;
        })
        .join('');

      criteriaSection = `
        <div class="section">
          <div class="section-title">Phase Gate Criteria (${achievementRate}% met)</div>
          ${criteriaItems}
        </div>`;
    }

    // Prescriptions
    let prescriptionSection = '';
    if (prescriptions.length > 0) {
      const rxRows = prescriptions
        .map((rx) => {
          const exercise = rx.exercise as Record<string, unknown> | null;
          const name = exercise ? (exercise.name as string) ?? (exercise.nameEn as string) ?? '' : 'N/A';
          const category = exercise ? (exercise.category as string) ?? '' : '';
          const sets = (rx.sets as number) ?? '-';
          const reps = (rx.reps as number) ?? '-';
          const durationSec = (rx.durationSec as number) ?? null;
          const notes = (rx.notes as string) ?? '';
          const isActive = (rx.isActive as boolean) ?? false;

          const durationStr = durationSec ? `${durationSec}s` : '-';
          const statusBadge = isActive
            ? '<span class="badge" style="background:#22c55e">Active</span>'
            : '<span class="badge" style="background:#9ca3af">Scheduled</span>';

          return `<tr>
            <td>${escapeHtml(name)}</td>
            <td>${escapeHtml(category)}</td>
            <td style="text-align:center">${sets} x ${reps}</td>
            <td style="text-align:center">${durationStr}</td>
            <td style="text-align:center">${statusBadge}</td>
            <td style="font-size:8pt">${escapeHtml(notes)}</td>
          </tr>`;
        })
        .join('');

      prescriptionSection = `
        <div class="section">
          <div class="section-title">Current Prescriptions</div>
          <table>
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Category</th>
                <th style="text-align:center">Sets x Reps</th>
                <th style="text-align:center">Duration</th>
                <th style="text-align:center">Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>${rxRows}</tbody>
          </table>
        </div>`;
    }

    programsHtml += `${programInfoSection}${criteriaSection}${prescriptionSection}`;
  }

  // SOAP
  let soapSection = '';
  if (includeSoap && soapNote) {
    soapSection = renderSoapSection(soapNote);
  }

  return buildDocument(
    'Rehab Assessment Report',
    athleteName,
    sportInfo,
    staffName,
    now,
    programsHtml + soapSection,
    generatedAt,
  );
}

// ---------------------------------------------------------------------------
// SOAP セクション共通
// ---------------------------------------------------------------------------

function renderSoapSection(note: SoapNote): string {
  return `
    <div class="section page-break">
      <div class="section-title">SOAP Note</div>
      <div style="font-size:8pt;color:#999;margin-bottom:6px">
        ${formatDateTime(note.created_at)}${note.ai_assisted ? ' (AI assisted)' : ''}
      </div>
      <div class="soap-section">
        <div class="soap-label">S (Subjective)</div>
        <div class="soap-content">${escapeHtml(note.s_text)}</div>
      </div>
      <div class="soap-section">
        <div class="soap-label">O (Objective)</div>
        <div class="soap-content">${escapeHtml(note.o_text)}</div>
      </div>
      <div class="soap-section">
        <div class="soap-label">A (Assessment)</div>
        <div class="soap-content">${escapeHtml(note.a_text)}</div>
      </div>
      <div class="soap-section">
        <div class="soap-label">P (Plan)</div>
        <div class="soap-content">${escapeHtml(note.p_text)}</div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// ドキュメント組み立て
// ---------------------------------------------------------------------------

function buildDocument(
  title: string,
  athleteName: string,
  sportInfo: string,
  staffName: string,
  dateStr: string,
  bodyContent: string,
  generatedAt: string,
): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${athleteName}</title>
  ${baseStyles()}
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="logo">PACE PLATFORM</div>
        <h1>${escapeHtml(title)}</h1>
      </div>
      <div class="meta">
        <div><strong>${athleteName}</strong></div>
        ${sportInfo ? `<div>${escapeHtml(sportInfo)}</div>` : ''}
        <div>Staff: ${escapeHtml(staffName)}</div>
        <div>${dateStr}</div>
        <div style="margin-top:4px;font-weight:600">Confidential</div>
      </div>
    </div>
    ${bodyContent}
    <div class="footer">
      Generated: ${formatDateTime(generatedAt)} | PACE Platform v6.2 | Confidential - Authorized personnel only
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    // --- Parse & validate request body ---
    const body: ExportPdfRequest = await request.json();

    const { athleteId, assessmentType, includeCharts, includeSoap } = body;

    if (!athleteId || !validateUUID(athleteId)) {
      return NextResponse.json(
        { success: false, error: 'athleteId の形式が不正です。' },
        { status: 400 },
      );
    }

    if (assessmentType !== 'conditioning' && assessmentType !== 'rehab') {
      return NextResponse.json(
        { success: false, error: 'assessmentType は "conditioning" または "rehab" である必要があります。' },
        { status: 400 },
      );
    }

    // --- Auth ---
    const supabase = await createClient();

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

    // --- Staff & Org ---
    const { data: staff } = await supabase
      .from('staff')
      .select('id, org_id, display_name')
      .eq('id', user.id)
      .single();

    if (!staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフプロファイルが見つかりません。' },
        { status: 403 },
      );
    }

    // --- Plan Gate: feature_ai_soap (Pro+) ---
    const accessResult = await canAccess(supabase, staff.org_id, 'feature_ai_soap');

    if (!accessResult.allowed) {
      return NextResponse.json(
        { success: false, error: accessResult.reason ?? 'この機能は Pro プラン以上で利用可能です。' },
        { status: 403 },
      );
    }

    // --- Athlete check (same org) ---
    const { data: athlete } = await supabase
      .from('athletes')
      .select('id, name, org_id, sport, position, number')
      .eq('id', athleteId)
      .eq('org_id', staff.org_id)
      .single();

    if (!athlete) {
      return NextResponse.json(
        { success: false, error: '選手が見つかりません。' },
        { status: 404 },
      );
    }

    const generatedAt = new Date().toISOString();
    const staffName = (staff.display_name as string) ?? user.email ?? 'Staff';

    // --- Fetch latest SOAP note if requested ---
    let soapNote: SoapNote | null = null;
    if (includeSoap) {
      const { data: soap } = await supabase
        .from('soap_notes')
        .select('id, s_text, o_text, a_text, p_text, created_at, ai_assisted')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      soapNote = soap as SoapNote | null;
    }

    let html: string;
    let filename: string;

    if (assessmentType === 'conditioning') {
      // --- Fetch conditioning data (mirror conditioning assessment API logic) ---
      const today = new Date();
      const daysBack42 = new Date(today);
      daysBack42.setDate(daysBack42.getDate() - 42);
      const startDate = daysBack42.toISOString().split('T')[0];

      const { data: metrics } = await supabase
        .from('daily_metrics')
        .select('date, nrs, srpe, sleep_score, fatigue_subjective, subjective_condition, hp_computed, hrv, acwr, training_duration_min')
        .eq('athlete_id', athleteId)
        .gte('date', startDate)
        .order('date', { ascending: true });

      const dailyMetrics = metrics ?? [];

      const { data: medHistory } = await supabase
        .from('medical_history')
        .select('body_part, condition, date, severity, risk_multiplier')
        .eq('athlete_id', athleteId)
        .order('date', { ascending: false });

      const { data: latestTrace } = await supabase
        .from('inference_trace_logs')
        .select('trace_id, decision, priority, inference_snapshot, timestamp_utc')
        .eq('athlete_id', athleteId)
        .order('timestamp_utc', { ascending: false })
        .limit(1)
        .single();

      // Build analysis data (replicating conditioning API logic)
      const loadAnalysis = buildLoadAnalysisData(dailyMetrics);
      const efficiencyAnalysis = buildEfficiencyAnalysisData(dailyMetrics);
      const painAnalysis = buildPainAnalysisData(dailyMetrics, medHistory ?? []);

      const pipeline = latestTrace
        ? {
            decision: latestTrace.decision as string,
            priority: latestTrace.priority as string,
            timestamp: latestTrace.timestamp_utc as string,
          }
        : null;

      html = renderConditioningHtml(
        athlete,
        staffName,
        pipeline,
        loadAnalysis,
        efficiencyAnalysis,
        painAnalysis,
        soapNote,
        includeSoap,
        generatedAt,
      );

      const dateSlug = generatedAt.split('T')[0];
      filename = `conditioning-assessment_${athlete.name.replace(/\s+/g, '-')}_${dateSlug}.html`;

    } else {
      // --- Fetch rehab data (mirror rehab assessment API logic) ---
      const { data: programs } = await supabase
        .from('rehab_programs')
        .select('id, diagnosis, injury_date, current_phase, status, created_at')
        .eq('athlete_id', athleteId)
        .in('status', ['active', 'on_hold'])
        .order('created_at', { ascending: false });

      const activePrograms = programs ?? [];

      const programDetails = await Promise.all(
        activePrograms.map(async (program) => {
          const programId = program.id as string;
          const injuryDate = program.injury_date as string;
          const currentPhase = (program.current_phase as number) ?? 1;

          const { data: gates } = await supabase
            .from('rehab_phase_gates')
            .select('phase, criteria, met, checked_at')
            .eq('program_id', programId)
            .order('phase', { ascending: true });

          const currentGate = (gates ?? []).find((g) => (g.phase as number) === currentPhase);
          const nextGate = (gates ?? []).find((g) => (g.phase as number) === currentPhase + 1);
          const criteria = ((nextGate?.criteria ?? currentGate?.criteria) as Record<string, unknown>[]) ?? [];
          const criteriaMet = criteria.filter((c) => c.met === true).length;
          const criteriaTotal = criteria.length;
          const achievementRate = criteriaTotal > 0 ? Math.round((criteriaMet / criteriaTotal) * 100) : 0;

          const daysSinceInjury = injuryDate
            ? Math.floor((Date.now() - new Date(injuryDate).getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          const { data: nrsMetrics } = await supabase
            .from('daily_metrics')
            .select('date, nrs')
            .eq('athlete_id', athleteId)
            .gte('date', injuryDate ?? '2020-01-01')
            .order('date', { ascending: true });

          const nrsTrend = (nrsMetrics ?? []).map((m) => ({
            date: m.date as string,
            nrs: (m.nrs as number) ?? 0,
          }));

          const initialNrs = nrsTrend.length > 0 ? (nrsTrend[0]?.nrs ?? 0) : 0;
          const currentNrs = nrsTrend.length > 0 ? (nrsTrend[nrsTrend.length - 1]?.nrs ?? 0) : 0;
          const nrsImprovement = initialNrs > 0 ? Math.round(((initialNrs - currentNrs) / initialNrs) * 100) : 0;

          const phaseProgress = Math.round((currentPhase / 4) * 100);
          const recoveryScore = Math.min(100, Math.round(
            nrsImprovement * 0.3 + phaseProgress * 0.4 + achievementRate * 0.3,
          ));

          const { data: prescriptions } = await supabase
            .from('rehab_prescriptions')
            .select('id, exercise_id, start_day, end_day, sets, reps, duration_sec, notes, status')
            .eq('program_id', programId)
            .eq('status', 'active');

          const exerciseIds = (prescriptions ?? []).map((p) => p.exercise_id as string);
          let exercises: Record<string, unknown>[] = [];
          if (exerciseIds.length > 0) {
            const { data: exData } = await supabase
              .from('rehab_exercises')
              .select('id, name, name_en, category, target_tissue, intensity_level, tissue_load, expected_effect, min_phase')
              .in('id', exerciseIds);
            exercises = exData ?? [];
          }

          const prescriptionDetails = (prescriptions ?? []).map((rx) => {
            const exercise = exercises.find((e) => (e.id as string) === (rx.exercise_id as string));
            return {
              id: rx.id,
              exercise: exercise
                ? { name: exercise.name, nameEn: exercise.name_en, category: exercise.category }
                : null,
              sets: rx.sets,
              reps: rx.reps,
              durationSec: rx.duration_sec,
              notes: rx.notes,
              isActive: daysSinceInjury >= (rx.start_day as number),
            };
          });

          return {
            programId,
            diagnosis: program.diagnosis,
            injuryDate,
            currentPhase,
            daysSinceInjury,
            recoveryScore,
            nrsImprovement,
            achievementRate,
            criteria: criteria.map((c) => ({
              name: (c as Record<string, unknown>).name ?? '',
              description: (c as Record<string, unknown>).description ?? '',
              met: (c as Record<string, unknown>).met ?? false,
              currentValue: (c as Record<string, unknown>).currentValue ?? null,
              targetValue: (c as Record<string, unknown>).targetValue ?? null,
            })),
            prescriptions: prescriptionDetails,
          };
        }),
      );

      html = renderRehabHtml(
        athlete,
        staffName,
        programDetails,
        soapNote,
        includeSoap,
        generatedAt,
      );

      const dateSlug = generatedAt.split('T')[0];
      filename = `rehab-assessment_${athlete.name.replace(/\s+/g, '-')}_${dateSlug}.html`;
    }

    return NextResponse.json({
      success: true,
      data: {
        html,
        filename,
        generatedAt,
      },
    });
  } catch (err) {
    console.error('[assessment/export-pdf:POST] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'PDF エクスポートの生成に失敗しました。',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// 分析データ構築（conditioning API のロジックを再利用）
// ---------------------------------------------------------------------------

function buildLoadAnalysisData(
  metrics: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const last28 = metrics.slice(-28);
  const last7 = metrics.slice(-7);

  const acwrTrend = last28.map((m) => ({
    date: m.date as string,
    value: (m.acwr as number) ?? 0,
  }));
  const currentAcwr = acwrTrend.length > 0 ? (acwrTrend[acwrTrend.length - 1]?.value ?? 0) : 0;

  const last7Srpe = last7.map((m) => (m.srpe as number) ?? 0);
  const last28Srpe = last28.map((m) => (m.srpe as number) ?? 0);
  const acuteLoad = last7Srpe.length > 0 ? last7Srpe.reduce((a, b) => a + b, 0) / last7Srpe.length : 0;
  const chronicLoad = last28Srpe.length > 0 ? last28Srpe.reduce((a, b) => a + b, 0) / last28Srpe.length : 0;

  const prev7 = metrics.slice(-14, -7).map((m) => (m.srpe as number) ?? 0);
  const prevAcute = prev7.length > 0 ? prev7.reduce((a, b) => a + b, 0) / prev7.length : acuteLoad;
  const acuteLoadChangePercent = prevAcute > 0 ? Math.round(((acuteLoad - prevAcute) / prevAcute) * 100) : 0;

  const mean7 = last7Srpe.length > 0 ? last7Srpe.reduce((a, b) => a + b, 0) / last7Srpe.length : 0;
  const sd7 = last7Srpe.length > 1
    ? Math.sqrt(last7Srpe.reduce((sum, v) => sum + (v - mean7) ** 2, 0) / (last7Srpe.length - 1))
    : 0;
  const currentMonotony = sd7 > 0 ? mean7 / sd7 : 0;
  const strain = currentMonotony * last7Srpe.reduce((a, b) => a + b, 0);

  const tissueHalfLives: Record<string, number> = {
    metabolic: 2,
    structural_soft: 7,
    structural_hard: 21,
    neuromotor: 3,
  };
  const tissueDamage: Record<string, { value: number; halfLifeDays: number }> = {};
  for (const [tissue, halfLife] of Object.entries(tissueHalfLives)) {
    const decayFactor = Math.LN2 / halfLife;
    let damage = 0;
    for (let i = 0; i < last28.length; i++) {
      const daysSince = last28.length - 1 - i;
      const srpe = (last28[i]?.srpe as number) ?? 0;
      const normalizedLoad = srpe / 1000;
      damage += normalizedLoad * Math.exp(-decayFactor * daysSince);
    }
    tissueDamage[tissue] = {
      value: Math.round(Math.min(damage, 1.0) * 100) / 100,
      halfLifeDays: halfLife,
    };
  }

  return {
    acwr: { current: Math.round(currentAcwr * 100) / 100, trend: acwrTrend },
    acuteLoad: Math.round(acuteLoad),
    chronicLoad: Math.round(chronicLoad),
    acuteLoadChangePercent,
    monotony: { current: Math.round(currentMonotony * 100) / 100 },
    strain: Math.round(strain),
    tissueDamage,
  };
}

function buildEfficiencyAnalysisData(
  metrics: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const last14 = metrics.slice(-14);
  const allMetrics = metrics;

  const decouplingTrend = last14.map((m) => {
    const srpe = (m.srpe as number) ?? 0;
    const hrv = (m.hrv as number) ?? 60;
    const decoupling = hrv > 0 ? srpe / (hrv * 10) : 0;
    return { date: m.date as string, value: Math.round(decoupling * 100) / 100 };
  });
  const currentDecoupling = decouplingTrend.length > 0
    ? (decouplingTrend[decouplingTrend.length - 1]?.value ?? 0)
    : 0;

  const fields = ['sleep_score', 'fatigue_subjective', 'subjective_condition'] as const;
  const fieldLabels: Record<string, string> = {
    sleep_score: 'sleep',
    fatigue_subjective: 'fatigue',
    subjective_condition: 'mood',
  };
  const zScores: Record<string, number> = {};
  let alertCount = 0;

  for (const field of fields) {
    const label = fieldLabels[field] ?? field;
    const values = allMetrics.map((m) => (m[field] as number) ?? 5).filter((v) => v > 0);
    if (values.length < 7) {
      zScores[label] = 0;
      continue;
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
    const latest = values[values.length - 1] ?? 0;
    const z = sd > 0 ? (latest - mean) / sd : 0;
    zScores[label] = Math.round(z * 100) / 100;
    if (z <= -1.5) alertCount++;
  }

  const overallEfficiencyScore = Math.max(0, Math.min(100,
    Math.round(50 + (zScores['sleep'] ?? 0) * 10 + (zScores['fatigue'] ?? 0) * 10 - currentDecoupling * 10),
  ));

  return {
    decoupling: { current: currentDecoupling, trend: decouplingTrend },
    zScores,
    zScoreAlertCount: alertCount,
    overallEfficiencyScore,
  };
}

function buildPainAnalysisData(
  metrics: Array<Record<string, unknown>>,
  medHistory: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const last14 = metrics.slice(-14);

  const nrsTrend = last14
    .filter((m) => (m.nrs as number) !== undefined)
    .map((m) => ({
      date: m.date as string,
      nrs: (m.nrs as number) ?? 0,
      srpe: (m.srpe as number) ?? 0,
    }));

  let correlation = 0;
  if (nrsTrend.length >= 3) {
    const nrsVals = nrsTrend.map((d) => d.nrs);
    const srpeVals = nrsTrend.map((d) => d.srpe);
    const nrsMean = nrsVals.reduce((a, b) => a + b, 0) / nrsVals.length;
    const srpeMean = srpeVals.reduce((a, b) => a + b, 0) / srpeVals.length;

    let num = 0, denA = 0, denB = 0;
    for (let i = 0; i < nrsVals.length; i++) {
      const a = (nrsVals[i] ?? 0) - nrsMean;
      const b = (srpeVals[i] ?? 0) - srpeMean;
      num += a * b;
      denA += a * a;
      denB += b * b;
    }
    const den = Math.sqrt(denA * denB);
    correlation = den > 0 ? Math.round((num / den) * 100) / 100 : 0;
  }

  const patterns: string[] = [];
  const recentNrs = nrsTrend.slice(-3).map((d) => d.nrs);
  if (recentNrs.length >= 3 && (recentNrs[0] ?? 0) < (recentNrs[1] ?? 0) && (recentNrs[1] ?? 0) < (recentNrs[2] ?? 0)) {
    patterns.push('3-day consecutive NRS increase');
  }
  if (correlation >= 0.7) {
    patterns.push('Load-dependent pain pattern (load reduction may improve symptoms)');
  }

  let compensationAlert: string | null = null;
  if (nrsTrend.filter((d) => d.nrs >= 3).length >= 3) {
    compensationAlert = 'Persistent pain across multiple days. Full kinetic chain evaluation recommended.';
  }

  return {
    nrsTrend,
    nrsLoadCorrelation: correlation,
    patterns,
    compensationAlert,
  };
}
