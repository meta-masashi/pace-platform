"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Area,
} from "recharts";
import { Loader2 } from "lucide-react";
import {
  getActivityLevel,
  scaleToLoad,
  getMdPrescription,
} from "@/lib/football/constants";

// ─── Types ─────────────────────────────────────────────────────────────────

interface GridPoint {
  scale: number;
  predicted_damage: number;
  status: "GREEN" | "YELLOW" | "RED";
}

interface DayPoint {
  date: string;
  load: number;
  damage: number;
  acwr: number;
  isFuture: boolean;
}

interface FutureCanvasProps {
  athleteId?: string;
  pastData: DayPoint[];
  /** D_crit threshold */
  damageCrit?: number;
  /** 次の試合日（MD タイムライン用） */
  nextMatchDate?: Date;
}

// ─── Client-side linear interpolation ──────────────────────────────────────

function lerp(grid: GridPoint[], scale: number): GridPoint {
  if (grid.length === 0) {
    return { scale, predicted_damage: 0, status: "GREEN" };
  }

  // Clamp
  const clamped = Math.max(
    grid[0]!.scale,
    Math.min(grid[grid.length - 1]!.scale, scale)
  );

  // Find bracket
  for (let i = 0; i < grid.length - 1; i++) {
    const lo = grid[i]!;
    const hi = grid[i + 1]!;
    if (clamped >= lo.scale && clamped <= hi.scale) {
      const t = hi.scale > lo.scale ? (clamped - lo.scale) / (hi.scale - lo.scale) : 0;
      const dmg = lo.predicted_damage + t * (hi.predicted_damage - lo.predicted_damage);
      const status = dmg > 90 ? "RED" : dmg > 60 ? "YELLOW" : "GREEN";
      return { scale: clamped, predicted_damage: Math.round(dmg * 10) / 10, status };
    }
  }

  return grid[grid.length - 1]!;
}

// ─── AI Prescription text ──────────────────────────────────────────────────

function getPrescription(
  interp: GridPoint,
  scalePct: number,
  mdOffset?: number
): { text: string; color: string; activityLabel: string } {
  const load = scaleToLoad(scalePct);
  const activity = getActivityLevel(load);

  // MD-aware prescription
  if (mdOffset !== undefined) {
    const mdText = getMdPrescription(mdOffset, scalePct, interp.status);
    if (mdText) {
      return {
        text: mdText,
        color: interp.status === "RED" ? "text-red-600" : interp.status === "YELLOW" ? "text-amber-600" : "text-brand-600",
        activityLabel: activity.shortLabel,
      };
    }
  }

  if (interp.status === "RED") {
    return {
      text: `${activity.shortLabel}の負荷をかけると閾値を突破（RED）します。リカバリーメニューに切り替えてください。`,
      color: "text-red-600",
      activityLabel: activity.shortLabel,
    };
  }
  if (interp.status === "YELLOW") {
    return {
      text: `${activity.shortLabel}はイエローゾーンです。タクティカル練習に留めてください。`,
      color: "text-amber-600",
      activityLabel: activity.shortLabel,
    };
  }
  return {
    text: `安全圏 — ${activity.shortLabel}を実施できます。`,
    color: "text-brand-600",
    activityLabel: activity.shortLabel,
  };
}

// ─── Component ─────────────────────────────────────────────────────────────

export function FutureCanvas({
  athleteId,
  pastData,
  damageCrit = 85,
  nextMatchDate,
}: FutureCanvasProps) {
  const [grid, setGrid] = useState<GridPoint[]>([]);
  const [sliderValue, setSliderValue] = useState(100);
  const [exactResult, setExactResult] = useState<GridPoint | null>(null);
  const [syncing, setSyncing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 1: Pre-compute grid on mount
  useEffect(() => {
    const defaultGrid: GridPoint[] = [
      { scale: 0, predicted_damage: 12.0, status: "GREEN" },
      { scale: 50, predicted_damage: 35.5, status: "GREEN" },
      { scale: 100, predicted_damage: 68.2, status: "YELLOW" },
      { scale: 150, predicted_damage: 95.8, status: "RED" },
      { scale: 200, predicted_damage: 100.0, status: "RED" },
    ];

    fetch(`/api/v6/simulate/grid?baseLoad=100${athleteId ? `&athleteId=${athleteId}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data) && data.length > 0) {
          setGrid(data);
        } else {
          setGrid(defaultGrid);
        }
      })
      .catch(() => setGrid(defaultGrid));
  }, [athleteId]);

  // Step 2: Client-side interpolation (zero-latency)
  const interpolated = useMemo(() => lerp(grid, sliderValue), [grid, sliderValue]);

  // Step 3: Lazy exact calculation (debounced on pointer up)
  const requestExactSolution = useCallback(
    (scale: number) => {
      setSyncing(true);
      setExactResult(null);

      fetch(`/api/v6/simulate/exact?scale=${scale}${athleteId ? `&athleteId=${athleteId}` : ""}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setExactResult(data);
        })
        .catch(() => {})
        .finally(() => setSyncing(false));
    },
    [athleteId]
  );

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSliderValue(Number(e.target.value));
    setExactResult(null); // Clear exact while dragging
  };

  const handlePointerUp = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      requestExactSolution(sliderValue);
    }, 300);
  };

  // Build chart data: past + future (modified by slider)
  const chartData = useMemo(() => {
    const scaleFactor = sliderValue / 100;
    return pastData.map((p) => ({
      ...p,
      damage: p.isFuture
        ? Math.min(100, p.damage * scaleFactor)
        : p.damage,
      load: p.isFuture ? Math.round(p.load * scaleFactor) : p.load,
    }));
  }, [pastData, sliderValue]);

  const displayResult = exactResult ?? interpolated;
  const currentLoad = scaleToLoad(sliderValue);
  const currentActivity = getActivityLevel(currentLoad);
  const prescription = getPrescription(displayResult, sliderValue);
  const isEstimate = !exactResult;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="p-4 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">
          予測・シミュレーター
        </h3>
        <p className="text-2xs text-slate-500">
          過去14日 + 未来7日間の予測
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3">
        {/* 左: 時系列グラフ */}
        <div className="lg:col-span-2 p-4">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
            >
              <defs>
                <linearGradient id="dmgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickLine={false}
              />
              <YAxis
                yAxisId="load"
                orientation="left"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="damage"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip />
              {/* D_crit threshold */}
              <ReferenceLine
                yAxisId="damage"
                y={damageCrit}
                stroke="#ef4444"
                strokeDasharray="6 3"
                strokeWidth={2}
                label={{
                  value: `D_crit (${damageCrit})`,
                  fill: "#ef4444",
                  fontSize: 10,
                  position: "insideTopRight",
                }}
              />
              {/* Load bars */}
              <Bar
                yAxisId="load"
                dataKey="load"
                fill="#94a3b8"
                fillOpacity={0.4}
                radius={[2, 2, 0, 0]}
                name="負荷 (Load)"
              />
              {/* D(t) area */}
              <Area
                yAxisId="damage"
                dataKey="damage"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#dmgGrad)"
                name="組織ダメージ D(t)"
                dot={false}
              />
              {/* ACWR line */}
              <Line
                yAxisId="damage"
                dataKey="acwr"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                name="ACWR (×20)"
                strokeDasharray="4 2"
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Timeline marker */}
          <div className="text-center">
            <span className="text-2xs text-slate-400">
              {nextMatchDate
                ? "◀ 過去 │ MD │ 未来 ▶"
                : "◀ 過去14日 │ Today │ 未来7日 ▶"}
            </span>
          </div>
        </div>

        {/* 右: What-If コントロールパネル */}
        <div className="p-5 border-t lg:border-t-0 lg:border-l border-slate-100 flex flex-col justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium mb-2">
              本日の予定負荷
            </p>

            {/* Slider */}
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={sliderValue}
              onChange={handleSliderChange}
              onPointerUp={handlePointerUp}
              onTouchEnd={handlePointerUp}
              className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-brand-600"
            />
            <div className="flex justify-between text-2xs text-slate-400 mt-1">
              <span>0%（休養）</span>
              <span>50%</span>
              <span>100%（フル）</span>
            </div>

            {/* Activity Mapper badge */}
            <div className="mt-3 flex items-center gap-2">
              <span className={`text-xs font-medium ${currentActivity.color}`}>
                ⚽ {currentActivity.shortLabel}
              </span>
              <span className="text-2xs text-slate-400">
                Load {currentLoad}
              </span>
            </div>

            {/* Result display */}
            <div className="mt-5 bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">予測ダメージ</span>
                <div className="flex items-center gap-1">
                  {isEstimate && (
                    <span className="text-xs text-slate-400 font-mono">~</span>
                  )}
                  {syncing && (
                    <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />
                  )}
                </div>
              </div>
              <span
                className={`text-3xl font-bold font-numeric transition-colors duration-300 ${
                  syncing
                    ? "text-slate-400"
                    : displayResult.status === "RED"
                      ? "text-red-600"
                      : displayResult.status === "YELLOW"
                        ? "text-amber-600"
                        : "text-brand-600"
                }`}
              >
                {displayResult.predicted_damage.toFixed(1)}
              </span>
              <span className="text-sm text-slate-400 ml-1">/ 100</span>

              <div className="mt-1">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    displayResult.status === "RED"
                      ? "bg-red-100 text-red-700"
                      : displayResult.status === "YELLOW"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-brand-100 text-brand-700"
                  }`}
                >
                  {displayResult.status}
                </span>
              </div>
            </div>
          </div>

          {/* AI Prescription */}
          <div className="mt-4 p-3 border border-slate-200 rounded-lg">
            <p className="text-2xs text-slate-500 font-medium mb-1">
              AI 処方箋
            </p>
            <p className={`text-xs leading-relaxed ${prescription.color}`}>
              {prescription.text}
            </p>
          </div>

          {/* Legal */}
          <p className="text-2xs text-slate-400 mt-3">
            ※ 意思決定支援の参考情報です
          </p>
        </div>
      </div>
    </div>
  );
}
