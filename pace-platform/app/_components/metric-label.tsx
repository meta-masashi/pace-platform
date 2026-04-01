'use client';

/**
 * MetricLabel — 指標の二層表現コンポーネント
 *
 * 選手向け: わかりやすい日本語ラベル + 色 + アイコン
 * スタッフ向け: 技術名 + 正確な数値
 */

type MetricId = 'acwr' | 'readiness' | 'fitness' | 'fatigue' | 'nrs' | 'hrv';
type StatusColor = 'green' | 'amber' | 'red' | 'blue' | 'gray';

interface Threshold {
  max: number;
  color: StatusColor;
  label: string;
}

interface MetricConfig {
  athleteLabel: string;
  staffLabel: string;
  thresholds: Threshold[];
  athleteFormat: (value: number) => string;
  staffFormat: (value: number) => string;
}

const METRIC_CONFIGS: Record<MetricId, MetricConfig> = {
  acwr: {
    athleteLabel: '負荷バランス',
    staffLabel: 'ACWR',
    thresholds: [
      { max: 0.8, color: 'blue', label: '低負荷' },
      { max: 1.3, color: 'green', label: '最適' },
      { max: 1.5, color: 'amber', label: '注意' },
      { max: Infinity, color: 'red', label: '過負荷' },
    ],
    athleteFormat: () => '', // thresholdのlabelを使用
    staffFormat: (v) => v.toFixed(2),
  },
  readiness: {
    athleteLabel: 'コンディション',
    staffLabel: 'コンディションスコア',
    thresholds: [
      { max: 40, color: 'red', label: '要注意' },
      { max: 70, color: 'amber', label: 'まずまず' },
      { max: Infinity, color: 'green', label: '良好' },
    ],
    athleteFormat: (v) => `${Math.round(v)}/100`,
    staffFormat: (v) => v.toFixed(1),
  },
  fitness: {
    athleteLabel: '体力の蓄積',
    staffLabel: 'フィットネス（42日平均）',
    thresholds: [
      { max: 30, color: 'red', label: '不足' },
      { max: 60, color: 'amber', label: '標準' },
      { max: Infinity, color: 'green', label: '充実' },
    ],
    athleteFormat: (v) => `${Math.round(v)}`,
    staffFormat: (v) => v.toFixed(1),
  },
  fatigue: {
    athleteLabel: '回復度',
    staffLabel: '疲労度（7日平均）',
    thresholds: [
      // 反転: 疲労が低い（回復度が高い）ほど良い
      { max: 30, color: 'green', label: '回復済み' },
      { max: 60, color: 'amber', label: '普通' },
      { max: Infinity, color: 'red', label: '疲労蓄積' },
    ],
    athleteFormat: (v) => `${Math.round(100 - v)}%`, // 反転表示
    staffFormat: (v) => v.toFixed(1),
  },
  nrs: {
    athleteLabel: '痛みの強さ',
    staffLabel: '痛み（NRS）',
    thresholds: [
      { max: 2, color: 'green', label: 'なし〜軽微' },
      { max: 5, color: 'amber', label: '中程度' },
      { max: 7, color: 'amber', label: 'やや強い' },
      { max: Infinity, color: 'red', label: '強い痛み' },
    ],
    athleteFormat: (v) => `${v}/10`,
    staffFormat: (v) => `${v}/10`,
  },
  hrv: {
    athleteLabel: '自律神経の回復度',
    staffLabel: '心拍変動（基準値差）',
    thresholds: [
      { max: -10, color: 'red', label: '低下' },
      { max: 5, color: 'amber', label: '正常' },
      { max: Infinity, color: 'green', label: '良好' },
    ],
    athleteFormat: (v) => (v >= 0 ? `+${Math.round(v)}` : `${Math.round(v)}`),
    staffFormat: (v) => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)),
  },
};

const STATUS_STYLES: Record<StatusColor, { bg: string; text: string; dot: string }> = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  red: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  gray: { bg: 'bg-gray-50', text: 'text-gray-500', dot: 'bg-gray-400' },
};

// NRS 顔アイコン
const NRS_FACES = ['😊', '🙂', '😐', '😐', '😕', '😟', '😣', '😖', '😫', '😭', '🆘'];

interface MetricLabelProps {
  metricId: MetricId;
  value: number;
  mode: 'athlete' | 'staff';
}

function getThreshold(config: MetricConfig, value: number): Threshold {
  return config.thresholds.find((t) => value <= t.max) ?? config.thresholds[config.thresholds.length - 1]!;
}

export function MetricLabel({ metricId, value, mode }: MetricLabelProps) {
  const config = METRIC_CONFIGS[metricId];
  const threshold = getThreshold(config, value);
  const styles = STATUS_STYLES[threshold.color];

  if (mode === 'athlete') {
    return (
      <div className={`rounded-lg ${styles.bg} px-3 py-2`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${styles.dot}`} />
            <span className="text-xs font-medium text-muted-foreground">
              {config.athleteLabel}
            </span>
          </div>
          <span className={`text-xs font-semibold ${styles.text}`}>
            {threshold.label}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          {metricId === 'nrs' && (
            <span className="text-base">{NRS_FACES[Math.min(10, Math.max(0, Math.round(value)))]}</span>
          )}
          <span className={`text-lg font-bold tabular-nums ${styles.text}`}>
            {config.athleteFormat(value) || threshold.label}
          </span>
        </div>
      </div>
    );
  }

  // Staff mode
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {config.staffLabel}
        </span>
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${styles.dot}`} />
          <span className={`text-[10px] font-medium ${styles.text}`}>
            {threshold.label}
          </span>
        </div>
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
        {config.staffFormat(value)}
      </p>
      <p className="text-[10px] text-muted-foreground">
        {config.athleteLabel}
      </p>
    </div>
  );
}
