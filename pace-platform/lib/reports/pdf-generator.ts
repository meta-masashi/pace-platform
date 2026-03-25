/**
 * PACE Platform — PDF レポート生成
 *
 * HTML ベースのレポートを生成する。ブラウザの印刷機能（window.print）で
 * PDF に変換することを前提とした、A4 印刷対応のプロフェッショナルな
 * 医療ドキュメントスタイリングを適用する。
 *
 * Puppeteer 等の重量級ライブラリには依存しない。
 */

import type {
  ReportData,
  ReportOptions,
  RiskAssessment,
  MenuModification,
  SOAPSummary,
  RehabSummary,
  DecayEntry,
} from './types';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** リスクレベルの閾値 */
const RISK_THRESHOLD_HIGH = 0.7;
const RISK_THRESHOLD_MEDIUM = 0.4;

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * リスクレベルに基づいてラベルを返す
 */
function riskLabel(level: number): string {
  if (level >= RISK_THRESHOLD_HIGH) return '高';
  if (level >= RISK_THRESHOLD_MEDIUM) return '中';
  return '低';
}

/**
 * リスクレベルに基づいて色を返す
 */
function riskColor(level: number): string {
  if (level >= RISK_THRESHOLD_HIGH) return '#dc2626';
  if (level >= RISK_THRESHOLD_MEDIUM) return '#f59e0b';
  return '#22c55e';
}

/**
 * コンディショニングスコアに基づいてステータスを返す
 */
function conditionStatus(score: number): { label: string; color: string } {
  if (score >= 80) return { label: '良好', color: '#22c55e' };
  if (score >= 60) return { label: '注意', color: '#f59e0b' };
  return { label: '要対応', color: '#dc2626' };
}

/**
 * ACWR に基づいてゾーンを返す
 */
function acwrZone(acwr: number): { label: string; color: string } {
  if (acwr >= 0.8 && acwr <= 1.3) return { label: '最適', color: '#22c55e' };
  if (acwr > 1.3 && acwr <= 1.5) return { label: '注意', color: '#f59e0b' };
  if (acwr > 1.5) return { label: '危険', color: '#dc2626' };
  return { label: '低負荷', color: '#3b82f6' };
}

/**
 * HTML 特殊文字をエスケープする
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// 共通 CSS
// ---------------------------------------------------------------------------

/**
 * A4 印刷対応のスタイルシートを返す
 */
function baseStyles(): string {
  return `
    <style>
      @page {
        size: A4;
        margin: 15mm 15mm 20mm 15mm;
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif;
        font-size: 10pt;
        line-height: 1.6;
        color: #1a1a1a;
        background: #fff;
      }

      .page {
        width: 210mm;
        min-height: 297mm;
        padding: 15mm;
        margin: 0 auto;
        background: #fff;
      }

      @media print {
        .page {
          padding: 0;
          margin: 0;
          width: 100%;
          min-height: auto;
        }
        .no-print {
          display: none !important;
        }
        .page-break {
          page-break-before: always;
        }
      }

      /* ヘッダー */
      .report-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid #1e3a5f;
        padding-bottom: 12px;
        margin-bottom: 20px;
      }

      .report-header h1 {
        font-size: 16pt;
        font-weight: 700;
        color: #1e3a5f;
      }

      .report-header .meta {
        text-align: right;
        font-size: 9pt;
        color: #666;
      }

      .report-header .logo {
        font-size: 11pt;
        font-weight: 700;
        color: #1e3a5f;
        letter-spacing: 2px;
      }

      /* セクション */
      .section {
        margin-bottom: 20px;
      }

      .section-title {
        font-size: 12pt;
        font-weight: 700;
        color: #1e3a5f;
        border-left: 4px solid #1e3a5f;
        padding-left: 8px;
        margin-bottom: 10px;
      }

      /* テーブル */
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 9pt;
        margin-bottom: 12px;
      }

      th {
        background: #f0f4f8;
        color: #1e3a5f;
        font-weight: 600;
        text-align: left;
        padding: 6px 8px;
        border: 1px solid #d1d5db;
      }

      td {
        padding: 5px 8px;
        border: 1px solid #d1d5db;
        vertical-align: top;
      }

      tr:nth-child(even) {
        background: #fafbfc;
      }

      /* ステータスバッジ */
      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 8pt;
        font-weight: 600;
        color: #fff;
      }

      /* KPI カード */
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-bottom: 16px;
      }

      .kpi-card {
        border: 1px solid #d1d5db;
        border-radius: 6px;
        padding: 12px;
        text-align: center;
      }

      .kpi-card .label {
        font-size: 8pt;
        color: #666;
        margin-bottom: 4px;
      }

      .kpi-card .value {
        font-size: 18pt;
        font-weight: 700;
      }

      .kpi-card .status {
        font-size: 8pt;
        font-weight: 600;
        margin-top: 2px;
      }

      /* SOAP */
      .soap-section {
        margin-bottom: 8px;
      }

      .soap-label {
        font-weight: 700;
        color: #1e3a5f;
        font-size: 9pt;
        margin-bottom: 2px;
      }

      .soap-content {
        background: #f9fafb;
        border-left: 3px solid #d1d5db;
        padding: 6px 10px;
        font-size: 9pt;
        white-space: pre-wrap;
      }

      /* フッター */
      .report-footer {
        margin-top: 30px;
        padding-top: 10px;
        border-top: 1px solid #d1d5db;
        font-size: 8pt;
        color: #999;
        text-align: center;
      }

      /* チームレポート用 */
      .team-summary-table th,
      .team-summary-table td {
        text-align: center;
      }

      .team-summary-table td:first-child {
        text-align: left;
      }

      .alert-box {
        border: 1px solid #fecaca;
        background: #fef2f2;
        border-radius: 6px;
        padding: 10px 14px;
        margin-bottom: 8px;
      }

      .alert-box .alert-title {
        font-weight: 700;
        color: #dc2626;
        font-size: 9pt;
      }

      .alert-box .alert-detail {
        font-size: 8pt;
        color: #555;
        margin-top: 2px;
      }
    </style>
  `;
}

// ---------------------------------------------------------------------------
// セクション生成
// ---------------------------------------------------------------------------

/**
 * ヘッダーセクション HTML を生成する
 */
function renderHeader(athleteName: string, date: string, title: string): string {
  return `
    <div class="report-header">
      <div>
        <div class="logo">PACE PLATFORM</div>
        <h1>${escapeHtml(title)}</h1>
      </div>
      <div class="meta">
        <div><strong>${escapeHtml(athleteName)}</strong></div>
        <div>作成日: ${escapeHtml(date)}</div>
        <div>機密 — 関係者限定</div>
      </div>
    </div>
  `;
}

/**
 * コンディション概要セクション HTML を生成する
 */
function renderConditionSummary(score: number, acwr: number): string {
  const cs = conditionStatus(score);
  const az = acwrZone(acwr);

  return `
    <div class="section">
      <div class="section-title">コンディション概要</div>
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="label">コンディショニングスコア</div>
          <div class="value" style="color:${cs.color}">${score}</div>
          <div class="status" style="color:${cs.color}">${cs.label}</div>
        </div>
        <div class="kpi-card">
          <div class="label">ACWR</div>
          <div class="value" style="color:${az.color}">${acwr.toFixed(2)}</div>
          <div class="status" style="color:${az.color}">${az.label}</div>
        </div>
        <div class="kpi-card">
          <div class="label">総合判定</div>
          <div class="value" style="color:${score >= 60 && acwr <= 1.5 ? '#22c55e' : '#dc2626'}">${score >= 60 && acwr <= 1.5 ? '参加可' : '要確認'}</div>
          <div class="status" style="color:#666">スタッフ最終判断</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * リスクアセスメントセクション HTML を生成する
 */
function renderRiskAssessments(assessments: RiskAssessment[]): string {
  if (assessments.length === 0) {
    return `
      <div class="section">
        <div class="section-title">リスクアセスメント</div>
        <p style="font-size:9pt;color:#666;">アセスメント結果なし</p>
      </div>
    `;
  }

  const sorted = [...assessments].sort((a, b) => b.riskLevel - a.riskLevel);

  const rows = sorted
    .map(
      (a) => `
      <tr>
        <td>${escapeHtml(a.nodeName)}</td>
        <td style="text-align:center">
          <span class="badge" style="background:${riskColor(a.riskLevel)}">
            ${riskLabel(a.riskLevel)}（${(a.riskLevel * 100).toFixed(0)}%）
          </span>
        </td>
        <td>${escapeHtml(a.evidenceText)}</td>
      </tr>
    `
    )
    .join('');

  return `
    <div class="section">
      <div class="section-title">リスクアセスメント</div>
      <table>
        <thead>
          <tr>
            <th style="width:25%">評価項目</th>
            <th style="width:20%;text-align:center">リスクレベル</th>
            <th>エビデンス</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/**
 * メニュー変更セクション HTML を生成する
 */
function renderMenuModifications(mods: MenuModification[]): string {
  if (mods.length === 0) {
    return `
      <div class="section">
        <div class="section-title">メニュー変更</div>
        <p style="font-size:9pt;color:#666;">変更なし</p>
      </div>
    `;
  }

  const rows = mods
    .map(
      (m) => `
      <tr>
        <td style="text-align:center">
          <span class="badge" style="background:${m.type === 'block' ? '#dc2626' : '#3b82f6'}">
            ${m.type === 'block' ? 'ブロック' : '挿入'}
          </span>
        </td>
        <td>${escapeHtml(m.exerciseName)}</td>
        <td>${escapeHtml(m.reason)}</td>
        <td style="font-size:8pt;color:#666">${escapeHtml(m.appliedAt)}</td>
      </tr>
    `
    )
    .join('');

  return `
    <div class="section">
      <div class="section-title">メニュー変更</div>
      <table>
        <thead>
          <tr>
            <th style="width:12%;text-align:center">種別</th>
            <th style="width:25%">エクササイズ</th>
            <th>理由</th>
            <th style="width:15%">適用日時</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/**
 * SOAPノートセクション HTML を生成する
 */
function renderSoapNotes(notes: SOAPSummary[], detailed: boolean): string {
  if (notes.length === 0) {
    return `
      <div class="section">
        <div class="section-title">SOAPノート</div>
        <p style="font-size:9pt;color:#666;">ノートなし</p>
      </div>
    `;
  }

  const displayNotes = detailed ? notes : notes.slice(0, 1);

  const blocks = displayNotes
    .map(
      (n) => `
      <div style="margin-bottom:14px">
        <div style="font-size:8pt;color:#999;margin-bottom:4px">記録日: ${escapeHtml(n.createdAt)}</div>
        <div class="soap-section">
          <div class="soap-label">S（主観的所見）</div>
          <div class="soap-content">${escapeHtml(n.sText)}</div>
        </div>
        <div class="soap-section">
          <div class="soap-label">O（客観的所見）</div>
          <div class="soap-content">${escapeHtml(n.oText)}</div>
        </div>
        <div class="soap-section">
          <div class="soap-label">A（アセスメント）</div>
          <div class="soap-content">${escapeHtml(n.aText)}</div>
        </div>
        <div class="soap-section">
          <div class="soap-label">P（計画）</div>
          <div class="soap-content">${escapeHtml(n.pText)}</div>
        </div>
      </div>
    `
    )
    .join('');

  return `
    <div class="section">
      <div class="section-title">SOAPノート</div>
      ${blocks}
    </div>
  `;
}

/**
 * リハビリ進捗セクション HTML を生成する
 */
function renderRehabProgress(rehab: RehabSummary | undefined): string {
  if (!rehab) return '';

  const statusLabels: Record<string, string> = {
    active: '進行中',
    completed: '完了',
    on_hold: '保留',
  };

  const statusColors: Record<string, string> = {
    active: '#3b82f6',
    completed: '#22c55e',
    on_hold: '#f59e0b',
  };

  return `
    <div class="section">
      <div class="section-title">リハビリ進捗</div>
      <table>
        <tbody>
          <tr>
            <th style="width:30%">診断コード</th>
            <td>${escapeHtml(rehab.diagnosisCode)}</td>
          </tr>
          <tr>
            <th>現在フェーズ</th>
            <td>フェーズ ${rehab.currentPhase} / 4</td>
          </tr>
          <tr>
            <th>ステータス</th>
            <td>
              <span class="badge" style="background:${statusColors[rehab.status] ?? '#666'}">
                ${statusLabels[rehab.status] ?? rehab.status}
              </span>
            </td>
          </tr>
          <tr>
            <th>ゲート基準</th>
            <td>
              <span class="badge" style="background:${rehab.gateStatus === 'met' ? '#22c55e' : '#f59e0b'}">
                ${rehab.gateStatus === 'met' ? '充足' : '未充足'}
              </span>
            </td>
          </tr>
          <tr>
            <th>開始日</th>
            <td>${escapeHtml(rehab.startDate)}</td>
          </tr>
          <tr>
            <th>推定 RTS 日</th>
            <td>${rehab.estimatedRtpDate ? escapeHtml(rehab.estimatedRtpDate) : '未定'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

/**
 * データ減衰ステータスセクション HTML を生成する
 */
function renderDecayStatus(entries: DecayEntry[] | undefined): string {
  if (!entries || entries.length === 0) return '';

  const rows = entries
    .map((e) => {
      const pct = Math.round(e.freshness * 100);
      const color = e.freshness >= 0.8 ? '#22c55e' : e.freshness >= 0.5 ? '#f59e0b' : '#dc2626';
      return `
        <tr>
          <td>${escapeHtml(e.metricName)}</td>
          <td style="font-size:8pt">${escapeHtml(e.lastUpdated)}</td>
          <td style="text-align:center">
            <span style="color:${color};font-weight:600">${pct}%</span>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="section">
      <div class="section-title">データ鮮度</div>
      <table>
        <thead>
          <tr>
            <th>指標</th>
            <th>最終更新</th>
            <th style="text-align:center">鮮度</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 選手レポート生成
// ---------------------------------------------------------------------------

/**
 * 選手個人レポートの HTML を生成する。
 *
 * ブラウザの window.print() または Puppeteer で PDF 変換可能な
 * A4 印刷対応の HTML ドキュメントを返す。
 *
 * @param data - 選手のレポートデータ
 * @param options - レポートオプション
 * @returns HTML 文字列
 */
export function generateAthleteReport(
  data: ReportData,
  options: ReportOptions
): string {
  const detailed = options.format === 'detailed';
  const title = detailed ? '選手詳細レポート' : '選手サマリーレポート';

  let body = '';
  body += renderHeader(data.athlete.name, data.date, title);
  body += renderConditionSummary(data.conditioningScore, data.acwr);
  body += renderRiskAssessments(data.riskAssessments);
  body += renderMenuModifications(data.menuModifications);
  body += renderSoapNotes(data.soapNotes, detailed);
  body += renderRehabProgress(data.rehabProgress);

  if (detailed) {
    body += renderDecayStatus(data.decayStatus);
  }

  body += `
    <div class="report-footer">
      PACE Platform — MDTミーティング資料 — ${escapeHtml(data.date)} — 機密
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — ${escapeHtml(data.athlete.name)}</title>
  ${baseStyles()}
</head>
<body>
  <div class="page">
    ${body}
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// チームレポート生成
// ---------------------------------------------------------------------------

/**
 * チーム全体の MDT ミーティング用レポート HTML を生成する。
 *
 * 全選手のコンディション一覧、クリティカルアラート、議題を含む。
 *
 * @param athletes - 全選手のレポートデータ
 * @param teamName - チーム名
 * @param date - レポート日付
 * @returns HTML 文字列
 */
export function generateTeamReport(
  athletes: ReportData[],
  teamName: string,
  date: string
): string {
  // ----- サマリーテーブル -----
  const summaryRows = athletes
    .map((a) => {
      const cs = conditionStatus(a.conditioningScore);
      const az = acwrZone(a.acwr);
      const highRisks = a.riskAssessments.filter(
        (r) => r.riskLevel >= RISK_THRESHOLD_HIGH
      );

      return `
        <tr>
          <td><strong>${escapeHtml(a.athlete.name)}</strong><br/><span style="font-size:8pt;color:#666">${escapeHtml(a.athlete.position)} #${escapeHtml(a.athlete.number)}</span></td>
          <td><span class="badge" style="background:${cs.color}">${a.conditioningScore}</span></td>
          <td><span style="color:${az.color};font-weight:600">${a.acwr.toFixed(2)}</span></td>
          <td>${highRisks.length > 0 ? `<span class="badge" style="background:#dc2626">${highRisks.length}件</span>` : '<span style="color:#22c55e">—</span>'}</td>
          <td>${a.rehabProgress ? `Ph.${a.rehabProgress.currentPhase}` : '—'}</td>
          <td>${a.menuModifications.length > 0 ? `${a.menuModifications.length}件` : '—'}</td>
        </tr>
      `;
    })
    .join('');

  const summarySection = `
    <div class="section">
      <div class="section-title">選手一覧</div>
      <table class="team-summary-table">
        <thead>
          <tr>
            <th style="text-align:left">選手名</th>
            <th>スコア</th>
            <th>ACWR</th>
            <th>高リスク</th>
            <th>リハビリ</th>
            <th>メニュー変更</th>
          </tr>
        </thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </div>
  `;

  // ----- クリティカルアラート -----
  const criticalAthletes = athletes.filter(
    (a) =>
      a.conditioningScore < 60 ||
      a.acwr > 1.5 ||
      a.riskAssessments.some((r) => r.riskLevel >= RISK_THRESHOLD_HIGH)
  );

  let alertsSection = '';
  if (criticalAthletes.length > 0) {
    const alertBoxes = criticalAthletes
      .map((a) => {
        const reasons: string[] = [];
        if (a.conditioningScore < 60) reasons.push(`スコア低下（${a.conditioningScore}）`);
        if (a.acwr > 1.5) reasons.push(`ACWR危険域（${a.acwr.toFixed(2)}）`);
        const highRisks = a.riskAssessments.filter((r) => r.riskLevel >= RISK_THRESHOLD_HIGH);
        if (highRisks.length > 0) {
          reasons.push(`高リスク: ${highRisks.map((r) => r.nodeName).join('、')}`);
        }

        return `
          <div class="alert-box">
            <div class="alert-title">${escapeHtml(a.athlete.name)}（${escapeHtml(a.athlete.position)} #${escapeHtml(a.athlete.number)}）</div>
            <div class="alert-detail">${reasons.map(escapeHtml).join(' / ')}</div>
          </div>
        `;
      })
      .join('');

    alertsSection = `
      <div class="section">
        <div class="section-title">クリティカルアラート</div>
        ${alertBoxes}
      </div>
    `;
  }

  // ----- 議題 -----
  const agendaItems: string[] = [];

  if (criticalAthletes.length > 0) {
    agendaItems.push(
      `要対応選手の確認（${criticalAthletes.length}名）`
    );
  }

  const rehabAthletes = athletes.filter((a) => a.rehabProgress);
  if (rehabAthletes.length > 0) {
    agendaItems.push(
      `リハビリ進捗報告（${rehabAthletes.length}名）`
    );
  }

  const menuChangeAthletes = athletes.filter(
    (a) => a.menuModifications.length > 0
  );
  if (menuChangeAthletes.length > 0) {
    agendaItems.push(
      `メニュー変更確認（${menuChangeAthletes.length}名）`
    );
  }

  agendaItems.push('次回ミーティングまでのアクションアイテム');

  const agendaSection = `
    <div class="section">
      <div class="section-title">MDT ミーティング議題</div>
      <table>
        <thead>
          <tr>
            <th style="width:8%;text-align:center">No.</th>
            <th>議題</th>
          </tr>
        </thead>
        <tbody>
          ${agendaItems.map((item, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${escapeHtml(item)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  // ----- 全体組み立て -----
  const header = `
    <div class="report-header">
      <div>
        <div class="logo">PACE PLATFORM</div>
        <h1>チーム MDT レポート</h1>
      </div>
      <div class="meta">
        <div><strong>${escapeHtml(teamName)}</strong></div>
        <div>作成日: ${escapeHtml(date)}</div>
        <div>選手数: ${athletes.length}名</div>
        <div>機密 — 関係者限定</div>
      </div>
    </div>
  `;

  const footer = `
    <div class="report-footer">
      PACE Platform — チーム MDT レポート — ${escapeHtml(teamName)} — ${escapeHtml(date)} — 機密
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>チーム MDT レポート — ${escapeHtml(teamName)}</title>
  ${baseStyles()}
</head>
<body>
  <div class="page">
    ${header}
    ${alertsSection}
    ${summarySection}
    ${agendaSection}
    ${footer}
  </div>
</body>
</html>`;
}
