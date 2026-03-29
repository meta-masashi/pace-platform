"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Loader2, AlertTriangle, TrendingDown, Shield } from "lucide-react";
import {
  interpolateSpline,
  type GridPoint,
  type InterpolatedResult,
} from "@/lib/whatif/interpolation";
import { clampLoadScale, PHYSIOLOGICAL_LIMITS } from "@/lib/whatif/safety-clamp";

// ─── Status colors & labels ──────────────────────────────────────────
const STATUS_CONFIG = {
  GREEN:  { color: "#10b981", bg: "bg-brand-50",  text: "text-brand-700", label: "良好",   icon: Shield },
  YELLOW: { color: "#f59e0b", bg: "bg-amber-50",    text: "text-amber-700",   label: "注意",   icon: TrendingDown },
  ORANGE: { color: "#f97316", bg: "bg-orange-50",    text: "text-orange-700",  label: "警戒",   icon: AlertTriangle },
  RED:    { color: "#ef4444", bg: "bg-red-50",       text: "text-red-700",     label: "停止",   icon: AlertTriangle },
};

interface WhatIfSimulatorProps {
  athleteId: string;
  athleteName: string;
  baseLoad?: number;
  tissue?: string;
}

type SimResult = InterpolatedResult & { is_exact?: boolean };

export function WhatIfSimulator({
  athleteId,
  athleteName,
  baseLoad = 100,
  tissue = "structural_soft",
}: WhatIfSimulatorProps) {
  // Grid cache (5 pre-computed points)
  const [grid, setGrid] = useState<GridPoint[]>([]);
  const [gridLoading, setGridLoading] = useState(true);

  // Slider state
  const [scale, setScale] = useState(100);
  const [result, setResult] = useState<SimResult | null>(null);

  // Exact computation state
  const [syncing, setSyncing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Step 1: Pre-compute grid on mount ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setGridLoading(true);

    fetch(
      `/api/v6/simulate/grid?athleteId=${athleteId}&baseLoad=${baseLoad}&tissue=${tissue}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.grid) {
          setGrid(data.grid);
          // Initialize with base load result
          const basePoint = data.grid.find((p: GridPoint) => p.scale === 100);
          if (basePoint) {
            setResult({
              predicted_damage: basePoint.predicted_damage,
              repair_rate: basePoint.repair_rate,
              status: basePoint.status,
              is_estimated: false,
              is_exact: true,
            });
          }
        }
      })
      .catch(() => {
        // Grid fetch failed — interpolation will use empty grid
      })
      .finally(() => {
        if (!cancelled) setGridLoading(false);
      });

    return () => { cancelled = true; };
  }, [athleteId, baseLoad, tissue]);

  // ── Step 2: Client-side interpolation (0ms latency) ──────────────
  const handleSliderChange = useCallback(
    (value: number) => {
      const clamped = clampLoadScale(value);
      setScale(clamped);

      if (grid.length >= 2) {
        const interpolated = interpolateSpline(grid, clamped);
        setResult({ ...interpolated, is_exact: false });
      }
    },
    [grid]
  );

  // ── Step 3: Exact computation on commit ──────────────────────────
  const handleSliderCommit = useCallback(
    async (value: number) => {
      const clamped = clampLoadScale(value);

      // Abort any in-flight request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSyncing(true);

      try {
        const res = await fetch("/api/v6/simulate/exact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            athleteId,
            load: (baseLoad * clamped) / 100,
            tissue,
          }),
          signal: controller.signal,
        });

        if (res.ok) {
          const data = await res.json();
          setResult({
            predicted_damage: data.predicted_damage,
            repair_rate: data.repair_rate,
            status: data.status,
            is_estimated: false,
            is_exact: true,
          });
        }
      } catch {
        // Timeout or abort — keep interpolated value
      } finally {
        setSyncing(false);
      }
    },
    [athleteId, baseLoad, tissue]
  );

  // ── Chart data ───────────────────────────────────────────────────
  const chartData = grid.map((p) => ({
    scale: p.scale,
    damage: p.predicted_damage,
    dCrit: p.d_crit,
  }));

  // Add current position to chart if not on a grid point
  const currentOnGrid = grid.some((p) => p.scale === scale);
  if (!currentOnGrid && result) {
    chartData.push({
      scale,
      damage: result.predicted_damage,
      dCrit: grid[0]?.d_crit ?? 80,
    });
    chartData.sort((a, b) => a.scale - b.scale);
  }

  const status = result?.status ?? "GREEN";
  const cfg = STATUS_CONFIG[status];
  const StatusIcon = cfg.icon;

  if (gridLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
        <span className="text-sm text-slate-500">シナリオを事前計算中...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              What-If シミュレーション
            </h3>
            <p className="text-2xs text-slate-500 mt-0.5">
              {athleteName} — {tissue === "structural_soft" ? "軟部組織" : tissue}
            </p>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${cfg.bg}`}>
            <StatusIcon className={`w-3.5 h-3.5 ${cfg.text}`} />
            <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
          </div>
        </div>
      </div>

      {/* Result Display */}
      <div className="px-5 py-4 bg-slate-50/50">
        <div className="flex items-end gap-1.5">
          <span
            className={`text-3xl font-bold font-numeric transition-colors duration-300 ${
              syncing ? "text-slate-400" : cfg.text
            }`}
          >
            {result && Number.isFinite(result.predicted_damage) ? result.predicted_damage : "—"}
          </span>
          <span className="text-sm text-slate-400 mb-1">/ 100</span>

          {/* Estimated indicator */}
          {result?.is_estimated && !syncing && (
            <span className="text-2xs text-slate-400 mb-1.5 ml-1">
              ~ estimated
            </span>
          )}

          {/* Syncing indicator */}
          {syncing && (
            <span className="flex items-center gap-1 text-2xs text-slate-400 mb-1.5 ml-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Syncing...
            </span>
          )}
        </div>
        <p className="text-2xs text-slate-500 mt-1">
          予測組織ストレス蓄積（明日時点）
        </p>
      </div>

      {/* Slider */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-700">
            負荷スケール
          </label>
          <span className="text-xs font-bold font-numeric text-slate-900">
            {scale}%
          </span>
        </div>
        <input
          type="range"
          min={PHYSIOLOGICAL_LIMITS.LOAD_SCALE_MIN}
          max={PHYSIOLOGICAL_LIMITS.LOAD_SCALE_MAX}
          step={1}
          value={scale}
          onChange={(e) => handleSliderChange(Number(e.target.value))}
          onPointerUp={(e) =>
            handleSliderCommit(Number((e.target as HTMLInputElement).value))
          }
          onKeyUp={(e) => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
              handleSliderCommit(scale);
            }
          }}
          className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-600
                     [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab
                     [&::-webkit-slider-thumb]:active:cursor-grabbing"
        />
        <div className="flex justify-between mt-1 text-2xs text-slate-400">
          <span>完全休養</span>
          <span>通常</span>
          <span>2倍負荷</span>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="px-5 pb-4">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
              <defs>
                <linearGradient id="damageGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={cfg.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="scale"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(1)}`, "Stress"]}
                labelFormatter={(l) => `負荷: ${l}%`}
              />
              <ReferenceLine
                x={scale}
                stroke={cfg.color}
                strokeWidth={2}
                strokeDasharray="4 4"
              />
              <ReferenceLine
                y={chartData[0]?.dCrit ?? 80}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{ value: "D_crit", fill: "#ef4444", fontSize: 9 }}
              />
              <Area
                type="monotone"
                dataKey="damage"
                stroke={cfg.color}
                strokeWidth={2}
                fill="url(#damageGrad)"
                dot={{ r: 3, fill: cfg.color }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Disclaimer */}
      <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100">
        <p className="text-2xs text-slate-400">
          ※ シミュレーション結果は意思決定支援のための参考値です。最終判断は有資格者が行ってください。
        </p>
      </div>
    </div>
  );
}
