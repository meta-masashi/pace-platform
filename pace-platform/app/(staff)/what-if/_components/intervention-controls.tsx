'use client';

import { type ReactNode, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InterventionState {
  trainingIntensity: number;
  sprintEnabled: boolean;
  jumpLandingEnabled: boolean;
  directionChangeEnabled: boolean;
  contactEnabled: boolean;
}

export const DEFAULT_INTERVENTION: InterventionState = {
  trainingIntensity: 70,
  sprintEnabled: true,
  jumpLandingEnabled: true,
  directionChangeEnabled: true,
  contactEnabled: true,
};

interface InterventionControlsProps {
  value: InterventionState;
  onChange: (next: InterventionState) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS = [
  {
    label: '完全休養',
    color: 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200',
    state: {
      trainingIntensity: 0,
      sprintEnabled: false,
      jumpLandingEnabled: false,
      directionChangeEnabled: false,
      contactEnabled: false,
    },
  },
  {
    label: '軽め調整',
    color:
      'bg-watchlist-50 text-watchlist-700 border-watchlist-200 hover:bg-watchlist-100',
    state: {
      trainingIntensity: 60,
      sprintEnabled: false,
      jumpLandingEnabled: true,
      directionChangeEnabled: true,
      contactEnabled: false,
    },
  },
  {
    label: '通常練習',
    color:
      'bg-optimal-50 text-optimal-700 border-optimal-200 hover:bg-optimal-100',
    state: DEFAULT_INTERVENTION,
  },
] as const;

// ---------------------------------------------------------------------------
// Exercise toggle config
// ---------------------------------------------------------------------------

const EXERCISE_TOGGLES: {
  key: keyof Pick<
    InterventionState,
    | 'sprintEnabled'
    | 'jumpLandingEnabled'
    | 'directionChangeEnabled'
    | 'contactEnabled'
  >;
  label: string;
  icon: ReactNode;
}[] = [
  {
    key: 'sprintEnabled',
    label: 'スプリント',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M13 4v16" />
        <path d="M17 4v16" />
        <path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
      </svg>
    ),
  },
  {
    key: 'jumpLandingEnabled',
    label: 'ジャンプ/着地',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2v20" />
        <path d="m17 7-5-5-5 5" />
        <path d="m17 17-5 5-5-5" />
      </svg>
    ),
  },
  {
    key: 'directionChangeEnabled',
    label: '方向転換',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="15 10 20 15 15 20" />
        <path d="M4 4v7a4 4 0 0 0 4 4h12" />
      </svg>
    ),
  },
  {
    key: 'contactEnabled',
    label: 'コンタクト',
    icon: (
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8" />
        <path d="M12 8v8" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InterventionControls({
  value,
  onChange,
  disabled,
}: InterventionControlsProps) {
  const setField = useCallback(
    <K extends keyof InterventionState>(
      key: K,
      v: InterventionState[K],
    ) => {
      onChange({ ...value, [key]: v });
    },
    [value, onChange],
  );

  // Intensity color
  const intensityColor =
    value.trainingIntensity <= 60
      ? 'accent-optimal-500'
      : value.trainingIntensity <= 80
        ? 'accent-watchlist-500'
        : 'accent-critical-500';

  const intensityBg =
    value.trainingIntensity <= 60
      ? 'bg-optimal-500'
      : value.trainingIntensity <= 80
        ? 'bg-watchlist-500'
        : 'bg-critical-500';

  return (
    <div className="space-y-5">
      {/* Preset buttons */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          プリセット
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={disabled}
              onClick={() => onChange(preset.state)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${preset.color}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Training intensity slider */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">
            練習強度
          </label>
          <span
            className={`rounded-md px-2 py-0.5 text-sm font-bold tabular-nums text-white ${intensityBg}`}
          >
            {value.trainingIntensity}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          disabled={disabled}
          value={value.trainingIntensity}
          onChange={(e) =>
            setField('trainingIntensity', Number(e.target.value))
          }
          className={`h-2 w-full cursor-pointer appearance-none rounded-full bg-muted disabled:cursor-not-allowed [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md ${intensityColor} [&::-webkit-slider-thumb]:bg-current`}
        />
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Exercise toggles */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          エクササイズカテゴリ
        </p>
        <div className="space-y-2">
          {EXERCISE_TOGGLES.map(({ key, label, icon }) => {
            const isOn = value[key];
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => setField(key, !isOn)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all duration-300 disabled:opacity-50 ${
                  isOn
                    ? 'border-optimal-200 bg-optimal-50 text-optimal-700'
                    : 'border-border bg-muted/50 text-muted-foreground'
                }`}
              >
                <span
                  className={`shrink-0 transition-colors duration-300 ${
                    isOn ? 'text-optimal-500' : 'text-muted-foreground/60'
                  }`}
                >
                  {icon}
                </span>
                <span
                  className={
                    isOn ? '' : 'line-through decoration-muted-foreground/40'
                  }
                >
                  {label}
                </span>
                {/* Toggle switch */}
                <span className="ml-auto">
                  <span
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-300 ${
                      isOn ? 'bg-optimal-500' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                        isOn ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
