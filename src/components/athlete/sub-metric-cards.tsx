"use client";

import { TrendingUp, TrendingDown, Minus, Activity, Battery, Gauge } from "lucide-react";

interface SubMetric {
  label: string;
  value: number;
  unit?: string;
  trend?: "up" | "down" | "stable";
  icon: React.ReactNode;
  color: string;
  description?: string;
}

interface SubMetricCardsProps {
  fitness: number;
  fatigue: number;
  acwr: number;
  fitnessTrend?: "up" | "down" | "stable";
  fatigueTrend?: "up" | "down" | "stable";
}

function getAcwrZone(acwr: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (acwr < 0.8) return { label: "低負荷", color: "text-blue-500", bgColor: "bg-blue-50" };
  if (acwr <= 1.3) return { label: "最適", color: "text-brand-600", bgColor: "bg-brand-50" };
  if (acwr <= 1.5) return { label: "注意", color: "text-amber-500", bgColor: "bg-amber-50" };
  return { label: "過負荷", color: "text-red-500", bgColor: "bg-red-50" };
}

function TrendIcon({ trend }: { trend?: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-brand-500" />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-slate-400" />;
}

function AcwrGauge({ value }: { value: number }) {
  const zone = getAcwrZone(value);
  const clampedValue = Math.max(0, Math.min(2.0, value));
  const percentage = (clampedValue / 2.0) * 100;

  return (
    <div className="mt-2">
      <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
        {/* Zone markers */}
        <div className="absolute left-[40%] top-0 bottom-0 w-px bg-slate-300" />
        <div className="absolute left-[65%] top-0 bottom-0 w-px bg-slate-300" />
        <div className="absolute left-[75%] top-0 bottom-0 w-px bg-slate-300" />
        {/* Current value indicator */}
        <div
          className="absolute top-0 bottom-0 rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor:
              value > 1.5
                ? "#ef4444"
                : value > 1.3
                  ? "#f59e0b"
                  : value >= 0.8
                    ? "#059669"
                    : "#3b82f6",
          }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-2xs text-slate-400">0</span>
        <span className={`text-2xs font-medium ${zone.color}`}>{zone.label}</span>
        <span className="text-2xs text-slate-400">2.0</span>
      </div>
    </div>
  );
}

export function SubMetricCards({
  fitness,
  fatigue,
  acwr,
  fitnessTrend,
  fatigueTrend,
}: SubMetricCardsProps) {
  const metrics: SubMetric[] = [
    {
      label: "フィットネス蓄積",
      value: fitness,
      icon: <Activity className="w-4 h-4" />,
      color: "text-brand-600",
      trend: fitnessTrend,
      description: "42日間の蓄積",
    },
    {
      label: "疲労負荷",
      value: fatigue,
      icon: <Battery className="w-4 h-4" />,
      color: "text-amber-500",
      trend: fatigueTrend,
      description: "7日間の負荷",
    },
    {
      label: "負荷バランス",
      value: acwr,
      icon: <Gauge className="w-4 h-4" />,
      color: getAcwrZone(acwr).color,
      description: "ACWR",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 w-full">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="bg-white rounded-xl p-3 shadow-sm border border-slate-100"
        >
          <div className="flex items-center justify-between mb-1">
            <div className={metric.color}>{metric.icon}</div>
            {metric.trend && <TrendIcon trend={metric.trend} />}
          </div>
          <p className="text-2xs text-slate-500 mb-0.5">{metric.label}</p>
          <p className={`text-lg font-bold font-numeric ${metric.color}`}>
            {metric.label === "負荷バランス"
              ? metric.value.toFixed(2)
              : Math.round(metric.value)}
          </p>
          {metric.label === "負荷バランス" && <AcwrGauge value={acwr} />}
          {metric.description && metric.label !== "負荷バランス" && (
            <p className="text-2xs text-slate-400 mt-0.5">{metric.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
