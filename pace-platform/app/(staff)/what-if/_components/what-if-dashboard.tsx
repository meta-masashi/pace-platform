'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import {
  InterventionControls,
  DEFAULT_INTERVENTION,
  type InterventionState,
} from './intervention-controls';
import { RiskComparisonPanel } from './risk-comparison-panel';
import {
  ScenarioTimelineChart,
  type TimelineDataPoint,
} from './scenario-timeline-chart';
import { CounterfactualExplanation } from './counterfactual-explanation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WhatIfDashboardProps {
  searchParamsPromise: Promise<{ athleteId?: string }>;
}

interface RiskNode {
  id: string;
  label: string;
  currentRisk: number;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: string;
}

interface SimulationResult {
  baselineRisk: number;
  interventionRisk: number;
  timeline: TimelineDataPoint[];
  explanation: string;
}

// Mock athletes for the selector (in a real app this comes from API)
const MOCK_ATHLETES = [
  { id: 'ath_001', name: '田中 太郎' },
  { id: 'ath_002', name: '鈴木 花子' },
  { id: 'ath_003', name: '山本 健太' },
  { id: 'ath_004', name: '佐藤 美咲' },
  { id: 'ath_005', name: '高橋 大地' },
];

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number,
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callback(...args), delay);
    },
    [callback, delay],
  ) as unknown as T;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WhatIfDashboard({ searchParamsPromise }: WhatIfDashboardProps) {
  const { athleteId: initialAthleteId } = use(searchParamsPromise);

  // ----- State -----
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(
    initialAthleteId ?? '',
  );
  const [targetDate, setTargetDate] = useState<string>('');
  const [riskNodes, setRiskNodes] = useState<RiskNode[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [selectedRiskNodeId, setSelectedRiskNodeId] = useState<string>('');
  const [intervention, setIntervention] =
    useState<InterventionState>(DEFAULT_INTERVENTION);

  const [simulationResult, setSimulationResult] =
    useState<SimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const [loadingAthlete, setLoadingAthlete] = useState(false);

  // ----- Fetch athlete data when selected -----
  useEffect(() => {
    if (!selectedAthleteId) {
      setRiskNodes([]);
      setCalendarEvents([]);
      setTargetDate('');
      setSelectedRiskNodeId('');
      setSimulationResult(null);
      return;
    }

    let cancelled = false;
    async function fetchAthleteData() {
      setLoadingAthlete(true);
      setSimulationResult(null);
      setSimulationError(null);

      try {
        // Fetch risk nodes from assessment
        const riskRes = await fetch(
          `/api/assessment?athleteId=${encodeURIComponent(selectedAthleteId)}`,
        );
        if (riskRes.ok) {
          const riskJson = await riskRes.json();
          if (!cancelled && riskJson.success && riskJson.data?.firedNodes) {
            const nodes: RiskNode[] = (
              riskJson.data.firedNodes as Array<{
                node_id: string;
                node_label: string;
                risk_score: number;
              }>
            ).map((n) => ({
              id: n.node_id,
              label: n.node_label,
              currentRisk: Math.round(n.risk_score * 100 * 10) / 10,
            }));
            setRiskNodes(nodes);
            if (nodes.length > 0) {
              setSelectedRiskNodeId(nodes[0]!.id);
            }
          }
        }

        // Fetch calendar events
        const calRes = await fetch(
          `/api/calendar/events?athleteId=${encodeURIComponent(selectedAthleteId)}&upcoming=true`,
        );
        if (calRes.ok) {
          const calJson = await calRes.json();
          if (!cancelled && calJson.success && calJson.data?.events) {
            const events: CalendarEvent[] = (
              calJson.data.events as Array<{
                id: string;
                title: string;
                start_date: string;
                event_type: string;
              }>
            ).map((e) => ({
              id: e.id,
              title: e.title,
              date: e.start_date,
              type: e.event_type,
            }));
            setCalendarEvents(events);

            // Auto-set target date to next match
            const nextMatch = events.find(
              (e) => e.type === 'match' || e.type === 'game',
            );
            if (nextMatch) {
              setTargetDate(nextMatch.date);
            }
          }
        }
      } catch {
        // Silently handle — user can still manually set values
      } finally {
        if (!cancelled) setLoadingAthlete(false);
      }
    }

    fetchAthleteData();
    return () => {
      cancelled = true;
    };
  }, [selectedAthleteId]);

  // ----- Simulation callback -----
  const runSimulation = useCallback(async () => {
    if (!selectedAthleteId || !selectedRiskNodeId) return;

    setSimulating(true);
    setSimulationError(null);

    try {
      const res = await fetch('/api/counterfactual/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId: selectedAthleteId,
          targetDate: targetDate || undefined,
          riskNodeId: selectedRiskNodeId,
          intervention: {
            trainingIntensity: intervention.trainingIntensity,
            sprintEnabled: intervention.sprintEnabled,
            jumpLandingEnabled: intervention.jumpLandingEnabled,
            directionChangeEnabled: intervention.directionChangeEnabled,
            contactEnabled: intervention.contactEnabled,
          },
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setSimulationError(json.error ?? 'シミュレーションに失敗しました。');
        return;
      }

      setSimulationResult({
        baselineRisk: json.data.baselineRisk,
        interventionRisk: json.data.interventionRisk,
        timeline: json.data.timeline ?? [],
        explanation: json.data.explanation ?? '',
      });
    } catch {
      setSimulationError('ネットワークエラーが発生しました。');
    } finally {
      setSimulating(false);
    }
  }, [
    selectedAthleteId,
    selectedRiskNodeId,
    targetDate,
    intervention,
  ]);

  // ----- Debounced simulation trigger -----
  const debouncedSimulate = useDebouncedCallback(runSimulation, 300);

  // ----- Auto-run simulation when intervention changes -----
  useEffect(() => {
    if (selectedAthleteId && selectedRiskNodeId) {
      debouncedSimulate();
    }
    // eslint-disable-next-line -- debounced deps intentional
  }, [intervention, selectedRiskNodeId, targetDate]);

  // ----- Computed values -----
  const selectedNode = riskNodes.find((n) => n.id === selectedRiskNodeId);
  const diff =
    simulationResult
      ? simulationResult.interventionRisk - simulationResult.baselineRisk
      : null;
  const isReduced = diff !== null ? diff < 0 : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
      {/* ============================================================== */}
      {/* Left panel — Controls (30%) */}
      {/* ============================================================== */}
      <div className="space-y-5">
        {/* Athlete selector */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            選手を選択
          </label>
          <select
            value={selectedAthleteId}
            onChange={(e) => setSelectedAthleteId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">選手を選んでください</option>
            {MOCK_ATHLETES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Target date selector */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            目標日（試合日）
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            disabled={!selectedAthleteId}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
          {calendarEvents.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {calendarEvents.slice(0, 3).map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setTargetDate(event.date)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    targetDate === event.date
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {event.title} ({event.date})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Risk node selector */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            対象リスクノード
          </label>
          {loadingAthlete ? (
            <div className="h-10 animate-pulse rounded-lg bg-muted" />
          ) : riskNodes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {selectedAthleteId
                  ? 'リスクノードが見つかりません'
                  : '選手を選択してください'}
              </p>
            </div>
          ) : (
            <select
              value={selectedRiskNodeId}
              onChange={(e) => setSelectedRiskNodeId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {riskNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label} ({node.currentRisk}%)
                </option>
              ))}
            </select>
          )}
          {selectedNode && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              現在のリスク: {selectedNode.currentRisk}%
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Intervention controls */}
        <InterventionControls
          value={intervention}
          onChange={setIntervention}
          disabled={!selectedAthleteId || !selectedRiskNodeId}
        />
      </div>

      {/* ============================================================== */}
      {/* Right panel — Results (70%) */}
      {/* ============================================================== */}
      <div className="space-y-4">
        {/* Simulation status bar */}
        {simulating && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
            <svg
              className="h-4 w-4 animate-spin text-primary"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                className="opacity-20"
              />
              <path
                d="M12 2a10 10 0 0 1 10 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xs font-medium text-primary">
              シミュレーション実行中...
            </span>
          </div>
        )}

        {/* Error state */}
        {simulationError && (
          <div className="rounded-lg border border-critical-200 bg-critical-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 shrink-0 text-critical-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-critical-700">{simulationError}</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!selectedAthleteId && (
          <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-border bg-card">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 text-muted-foreground/30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <circle cx="12" cy="12" r="10" />
                <path d="M12 17h.01" />
              </svg>
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                選手を選択してシミュレーションを開始
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                左のパネルから選手・リスクノードを選び、介入パラメータを調整してください
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {selectedAthleteId && (
          <>
            {/* Risk comparison */}
            <RiskComparisonPanel
              baselineRisk={simulationResult?.baselineRisk ?? null}
              interventionRisk={simulationResult?.interventionRisk ?? null}
              loading={simulating && !simulationResult}
            />

            {/* Timeline chart */}
            <ScenarioTimelineChart
              data={simulationResult?.timeline ?? []}
              targetDate={targetDate || null}
              loading={simulating && !simulationResult}
            />

            {/* Explanation */}
            <CounterfactualExplanation
              explanation={simulationResult?.explanation ?? null}
              isReduced={isReduced}
              loading={simulating && !simulationResult}
            />
          </>
        )}
      </div>
    </div>
  );
}
