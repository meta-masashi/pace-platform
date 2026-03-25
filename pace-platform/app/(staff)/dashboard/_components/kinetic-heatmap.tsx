'use client';

import { useCallback, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainReaction {
  from: string;
  to: string;
  coupling: number;
  description: string;
}

export interface KineticHeatmapProps {
  tissueStress: Record<string, number>; // region_id -> damage 0-100
  chainReactions: ChainReaction[];
  onRegionClick?: (regionId: string) => void;
}

// ---------------------------------------------------------------------------
// Body Region definitions
// ---------------------------------------------------------------------------

interface BodyRegion {
  id: string;
  label: string;
  labelJa: string;
  /** SVG path for the region shape */
  path: string;
  /** Center point for chain lines and label positioning */
  cx: number;
  cy: number;
  view: 'front' | 'back' | 'both';
}

const BODY_REGIONS: BodyRegion[] = [
  // Head/Neck
  { id: 'head_neck', label: 'Head/Neck', labelJa: '頭部/頸部', path: 'M140,30 C140,15 160,15 160,30 L165,55 C165,60 135,60 135,55 Z', cx: 150, cy: 40, view: 'both' },
  // Shoulders
  { id: 'left_shoulder', label: 'Left Shoulder', labelJa: '左肩', path: 'M115,65 L135,60 L135,80 L110,85 Z', cx: 122, cy: 72, view: 'both' },
  { id: 'right_shoulder', label: 'Right Shoulder', labelJa: '右肩', path: 'M165,60 L185,65 L190,85 L165,80 Z', cx: 178, cy: 72, view: 'both' },
  // Chest
  { id: 'chest', label: 'Chest', labelJa: '胸部', path: 'M135,60 L165,60 L165,110 L135,110 Z', cx: 150, cy: 85, view: 'front' },
  // Elbows
  { id: 'left_elbow', label: 'Left Elbow', labelJa: '左肘', path: 'M95,120 L110,115 L115,140 L100,145 Z', cx: 105, cy: 130, view: 'both' },
  { id: 'right_elbow', label: 'Right Elbow', labelJa: '右肘', path: 'M190,115 L205,120 L200,145 L185,140 Z', cx: 195, cy: 130, view: 'both' },
  // Wrists
  { id: 'left_wrist', label: 'Left Wrist', labelJa: '左手首', path: 'M85,160 L100,155 L103,175 L88,178 Z', cx: 93, cy: 167, view: 'both' },
  { id: 'right_wrist', label: 'Right Wrist', labelJa: '右手首', path: 'M200,155 L215,160 L212,178 L197,175 Z', cx: 207, cy: 167, view: 'both' },
  // Core/Abdomen
  { id: 'core', label: 'Core', labelJa: '体幹/腹部', path: 'M135,110 L165,110 L165,155 L135,155 Z', cx: 150, cy: 132, view: 'front' },
  // Lower back
  { id: 'lower_back', label: 'Lower Back', labelJa: '腰部', path: 'M135,110 L165,110 L165,155 L135,155 Z', cx: 150, cy: 132, view: 'back' },
  // Hips
  { id: 'left_hip', label: 'Left Hip', labelJa: '左股関節', path: 'M125,155 L145,155 L140,185 L120,185 Z', cx: 132, cy: 170, view: 'both' },
  { id: 'right_hip', label: 'Right Hip', labelJa: '右股関節', path: 'M155,155 L175,155 L180,185 L160,185 Z', cx: 168, cy: 170, view: 'both' },
  // Knees
  { id: 'left_knee', label: 'Left Knee', labelJa: '左膝', path: 'M118,220 L138,220 L135,250 L115,250 Z', cx: 127, cy: 235, view: 'both' },
  { id: 'right_knee', label: 'Right Knee', labelJa: '右膝', path: 'M162,220 L182,220 L185,250 L165,250 Z', cx: 173, cy: 235, view: 'both' },
  // Ankles
  { id: 'left_ankle', label: 'Left Ankle', labelJa: '左足首', path: 'M115,290 L135,290 L133,315 L117,315 Z', cx: 125, cy: 302, view: 'both' },
  { id: 'right_ankle', label: 'Right Ankle', labelJa: '右足首', path: 'M165,290 L185,290 L183,315 L167,315 Z', cx: 175, cy: 302, view: 'both' },
];

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function getDamageColor(damage: number | undefined): string {
  if (damage === undefined || damage === null) return '#374151'; // gray
  if (damage <= 30) return '#10B981'; // green
  if (damage <= 60) return '#FF9F29'; // amber
  if (damage <= 80) return '#F97316'; // orange
  return '#FF4B4B'; // red (critical)
}

function getDamageLevel(damage: number | undefined): string {
  if (damage === undefined || damage === null) return 'データなし';
  if (damage <= 30) return '低リスク';
  if (damage <= 60) return '中リスク';
  if (damage <= 80) return '高リスク';
  return '臨界';
}

function isCritical(damage: number | undefined): boolean {
  return damage !== undefined && damage > 80;
}

// ---------------------------------------------------------------------------
// Popup Card
// ---------------------------------------------------------------------------

interface PopupData {
  region: BodyRegion;
  damage: number | undefined;
  chains: ChainReaction[];
  x: number;
  y: number;
}

function RegionPopup({ data, onClose }: { data: PopupData; onClose: () => void }) {
  const { region, damage, chains } = data;

  // Position popup relative to region center — clamp to SVG bounds
  const popupX = Math.max(20, Math.min(data.x - 90, 200));
  const popupY = data.y > 200 ? data.y - 120 : data.y + 20;

  return (
    <g>
      {/* Backdrop click handler */}
      <rect
        x="0"
        y="0"
        width="300"
        height="340"
        fill="transparent"
        onClick={onClose}
        style={{ cursor: 'default' }}
      />
      {/* Popup card */}
      <foreignObject x={popupX} y={popupY} width="180" height="120">
        <div className="rounded-lg border border-border bg-card p-2.5 text-xs shadow-lg">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-bold text-card-foreground">{region.labelJa}</span>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-card-foreground"
              aria-label="閉じる"
            >
              &times;
            </button>
          </div>
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: getDamageColor(damage) }}
            />
            <span className="font-mono text-sm font-bold text-card-foreground">
              {damage !== undefined ? `${Math.round(damage)}%` : '—'}
            </span>
            <span className="text-muted-foreground">{getDamageLevel(damage)}</span>
          </div>
          {chains.length > 0 && (
            <div className="space-y-1 border-t border-border pt-1.5">
              {chains.map((c, i) => (
                <div key={i} className="text-2xs leading-tight text-muted-foreground">
                  <span className="font-medium text-amber-caution-500">
                    連鎖 &times;{c.coupling.toFixed(1)}
                  </span>{' '}
                  {c.description}
                </div>
              ))}
            </div>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Body outline SVG (simplified front/back silhouette)
// ---------------------------------------------------------------------------

function BodyOutline() {
  return (
    <path
      d="
        M150,8
        C138,8 132,18 132,30
        L130,55
        C130,58 128,62 115,65
        L95,72
        C90,73 85,78 85,85
        L82,115
        C82,120 85,125 88,128
        L80,160
        C78,172 82,178 86,180
        L90,182
        L95,155
        L110,155
        L120,185
        L115,220
        L112,250
        L108,290
        L112,310
        C112,318 118,322 125,322
        C132,322 138,318 138,310
        L135,290
        L132,250
        L128,220
        L135,185
        L145,158
        L155,158
        L165,185
        L172,220
        L168,250
        L165,290
        L162,310
        C162,318 168,322 175,322
        C182,322 188,318 188,310
        L192,290
        L188,250
        L185,220
        L180,185
        L190,155
        L205,155
        L210,182
        L214,180
        C218,178 222,172 220,160
        L212,128
        C215,125 218,120 218,115
        L215,85
        C215,78 210,73 205,72
        L185,65
        C172,62 170,58 170,55
        L168,30
        C168,18 162,8 150,8
        Z
      "
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className="text-deep-space-200"
      opacity={0.4}
    />
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function KineticHeatmap({
  tissueStress,
  chainReactions,
  onRegionClick,
}: KineticHeatmapProps) {
  const [view, setView] = useState<'front' | 'back'>('front');
  const [popup, setPopup] = useState<PopupData | null>(null);

  const visibleRegions = useMemo(
    () => BODY_REGIONS.filter((r) => r.view === view || r.view === 'both'),
    [view],
  );

  const handleRegionClick = useCallback(
    (region: BodyRegion) => {
      const damage = tissueStress[region.id];
      const relatedChains = chainReactions.filter(
        (c) => c.from === region.id || c.to === region.id,
      );
      setPopup({ region, damage, chains: relatedChains, x: region.cx, y: region.cy });
      onRegionClick?.(region.id);
    },
    [tissueStress, chainReactions, onRegionClick],
  );

  // Build chain line data with region center positions
  const chainLines = useMemo(() => {
    const regionMap = new Map(BODY_REGIONS.map((r) => [r.id, r]));
    return chainReactions
      .map((chain) => {
        const from = regionMap.get(chain.from);
        const to = regionMap.get(chain.to);
        if (!from || !to) return null;
        // Only show if both regions are visible in current view
        const fromVisible = from.view === view || from.view === 'both';
        const toVisible = to.view === view || to.view === 'both';
        if (!fromVisible || !toVisible) return null;
        return { ...chain, fromRegion: from, toRegion: to };
      })
      .filter(Boolean) as Array<ChainReaction & { fromRegion: BodyRegion; toRegion: BodyRegion }>;
  }, [chainReactions, view]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-card-foreground">
          運動連鎖ヒートマップ
        </h3>
        <div className="flex rounded-md border border-border">
          <button
            type="button"
            onClick={() => { setView('front'); setPopup(null); }}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              view === 'front'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-card-foreground'
            }`}
          >
            前面
          </button>
          <button
            type="button"
            onClick={() => { setView('back'); setPopup(null); }}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              view === 'back'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-card-foreground'
            }`}
          >
            背面
          </button>
        </div>
      </div>

      {/* SVG Body Map */}
      <div className="flex justify-center">
        <svg
          viewBox="0 0 300 340"
          className="h-auto w-full max-w-[280px]"
          role="img"
          aria-label={`身体ヒートマップ（${view === 'front' ? '前面' : '背面'}）`}
        >
          {/* Body silhouette outline */}
          <BodyOutline />

          {/* Chain reaction lines */}
          {chainLines.map((chain, i) => (
            <line
              key={`chain-${i}`}
              x1={chain.fromRegion.cx}
              y1={chain.fromRegion.cy}
              x2={chain.toRegion.cx}
              y2={chain.toRegion.cy}
              stroke="#FF4B4B"
              strokeWidth={Math.max(1, chain.coupling)}
              className="chain-line-animated"
              opacity={0.6}
            />
          ))}

          {/* Clickable body regions */}
          {visibleRegions.map((region) => {
            const damage = tissueStress[region.id];
            const color = getDamageColor(damage);
            const critical = isCritical(damage);
            return (
              <g key={region.id}>
                <path
                  d={region.path}
                  fill={color}
                  opacity={0.7}
                  stroke={color}
                  strokeWidth={popup?.region.id === region.id ? 2 : 0.5}
                  className={`cursor-pointer transition-opacity hover:opacity-100 ${
                    critical ? 'animate-core-alert' : ''
                  }`}
                  style={critical ? { animationDuration: '2s' } : undefined}
                  onClick={() => handleRegionClick(region)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${region.labelJa}: ${damage !== undefined ? `${Math.round(damage)}%` : 'データなし'}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRegionClick(region);
                    }
                  }}
                />
                {/* Small damage label */}
                {damage !== undefined && (
                  <text
                    x={region.cx}
                    y={region.cy + 4}
                    textAnchor="middle"
                    fill="white"
                    fontSize="8"
                    fontWeight="bold"
                    className="pointer-events-none select-none"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                  >
                    {Math.round(damage)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Popup overlay */}
          {popup && <RegionPopup data={popup} onClose={() => setPopup(null)} />}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-2xs text-muted-foreground">
        <LegendDot color="#374151" label="データなし" />
        <LegendDot color="#10B981" label="低 (0-30%)" />
        <LegendDot color="#FF9F29" label="中 (30-60%)" />
        <LegendDot color="#F97316" label="高 (60-80%)" />
        <LegendDot color="#FF4B4B" label="臨界 (80-100%)" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
