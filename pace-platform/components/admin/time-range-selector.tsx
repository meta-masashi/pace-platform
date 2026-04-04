'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// TimeRangeSelector — 期間選択コンポーネント
// ---------------------------------------------------------------------------

type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d';

interface TimeRangeSelectorProps {
  value?: TimeRange;
  onChange: (range: TimeRange) => void;
  options?: TimeRange[];
}

const LABELS: Record<TimeRange, string> = {
  '1h': '1時間',
  '24h': '24時間',
  '7d': '7日',
  '30d': '30日',
  '90d': '90日',
};

export function TimeRangeSelector({
  value: controlledValue,
  onChange,
  options = ['1h', '24h', '7d', '30d', '90d'],
}: TimeRangeSelectorProps) {
  const [internalValue, setInternalValue] = useState<TimeRange>(options[2] ?? '7d');
  const value = controlledValue ?? internalValue;

  function handleChange(range: TimeRange) {
    setInternalValue(range);
    onChange(range);
  }

  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => handleChange(opt)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {LABELS[opt]}
        </button>
      ))}
    </div>
  );
}
