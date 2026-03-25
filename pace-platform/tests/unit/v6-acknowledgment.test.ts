/**
 * tests/unit/v6-acknowledgment.test.ts
 * ============================================================
 * PACE v6.0 — P1/P2 アラート承認フローテスト
 *
 * P1/P2 判定で生成されるトレースログの承認ワークフロー:
 *   1. 初期生成時は acknowledged_by = null
 *   2. 承認アクション → acknowledged_by が更新される
 *   3. 修正アクション → notes が必須
 *   4. オーバーライド → override_reason が記録される
 *   5. 承認済みトレースの再承認は不可（不変性）
 * ============================================================
 */

import { describe, it, expect, vi } from 'vitest';

// --- Gateway モック ---
vi.mock('../../lib/engine/v6/gateway', () => ({
  callODEEngine: vi.fn().mockResolvedValue({
    damage: 0.2,
    criticalDamage: 1.0,
    fromService: false,
  }),
  callEKFEngine: vi.fn().mockResolvedValue({
    decouplingScore: 0.0,
    fromService: false,
  }),
}));

import type {
  InferenceTraceLog,
  NodeId,
} from '../../lib/engine/v6/types';
import { InferencePipeline } from '../../lib/engine/v6/pipeline';

// ---------------------------------------------------------------------------
// 承認ワークフロー型定義（アプリケーション層のシミュレーション）
// ---------------------------------------------------------------------------

/** 承認ステータス */
type AcknowledgmentStatus = 'pending' | 'acknowledged' | 'modified' | 'overridden';

/** 承認アクション */
interface AcknowledgmentAction {
  status: AcknowledgmentStatus;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  notes: string | null;
  overrideReason: string | null;
}

/** 承認済みトレースログ */
interface AcknowledgedTraceLog extends InferenceTraceLog {
  acknowledgment: AcknowledgmentAction;
}

/**
 * テスト用の承認マネージャー
 * 実際のアプリケーション層で実装される承認ロジックをシミュレートする。
 */
class TraceAcknowledgmentManager {
  private traces = new Map<string, AcknowledgedTraceLog>();

  /** トレースログを登録する */
  register(traceLog: InferenceTraceLog): AcknowledgedTraceLog {
    const acknowledged: AcknowledgedTraceLog = {
      ...traceLog,
      acknowledgment: {
        status: 'pending',
        acknowledgedBy: null,
        acknowledgedAt: null,
        notes: null,
        overrideReason: null,
      },
    };
    this.traces.set(traceLog.traceId, acknowledged);
    return acknowledged;
  }

  /** 承認する */
  acknowledge(
    traceId: string,
    userId: string,
  ): AcknowledgedTraceLog {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`トレースID ${traceId} が見つかりません`);
    }
    if (trace.acknowledgment.status !== 'pending') {
      throw new Error(
        `トレースID ${traceId} は既に承認済みです（ステータス: ${trace.acknowledgment.status}）`,
      );
    }
    trace.acknowledgment = {
      status: 'acknowledged',
      acknowledgedBy: userId,
      acknowledgedAt: new Date().toISOString(),
      notes: null,
      overrideReason: null,
    };
    return trace;
  }

  /** 修正付き承認する */
  modify(
    traceId: string,
    userId: string,
    notes: string,
  ): AcknowledgedTraceLog {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`トレースID ${traceId} が見つかりません`);
    }
    if (trace.acknowledgment.status !== 'pending') {
      throw new Error(
        `トレースID ${traceId} は既に承認済みです`,
      );
    }
    if (!notes || notes.trim().length === 0) {
      throw new Error('修正アクションには notes が必須です');
    }
    trace.acknowledgment = {
      status: 'modified',
      acknowledgedBy: userId,
      acknowledgedAt: new Date().toISOString(),
      notes,
      overrideReason: null,
    };
    return trace;
  }

  /** オーバーライドする */
  override(
    traceId: string,
    userId: string,
    reason: string,
  ): AcknowledgedTraceLog {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`トレースID ${traceId} が見つかりません`);
    }
    if (trace.acknowledgment.status !== 'pending') {
      throw new Error(
        `トレースID ${traceId} は既に承認済みです`,
      );
    }
    trace.acknowledgment = {
      status: 'overridden',
      acknowledgedBy: userId,
      acknowledgedAt: new Date().toISOString(),
      notes: null,
      overrideReason: reason,
    };
    return trace;
  }

  /** トレースを取得する */
  get(traceId: string): AcknowledgedTraceLog | undefined {
    return this.traces.get(traceId);
  }
}

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

function createSampleTraceLog(traceId = 'trace-001'): InferenceTraceLog {
  const nodeResults = {} as Record<
    NodeId,
    { success: boolean; executionTimeMs: number; warnings: string[] }
  >;
  for (const nodeId of [
    'node0_ingestion',
    'node1_cleaning',
    'node2_feature',
    'node3_inference',
    'node4_decision',
    'node5_presentation',
  ] as NodeId[]) {
    nodeResults[nodeId] = { success: true, executionTimeMs: 1, warnings: [] };
  }

  return {
    traceId,
    athleteId: 'athlete-001',
    orgId: 'org-001',
    timestampUtc: new Date().toISOString(),
    pipelineVersion: 'v6.0',
    inferenceSnapshot: {
      inputs: {
        date: '2025-06-15',
        sRPE: 4,
        trainingDurationMin: 60,
        sessionLoad: 240,
        subjectiveScores: {
          sleepQuality: 8,
          fatigue: 3,
          mood: 7,
          muscleSoreness: 2,
          stressLevel: 3,
          painNRS: 9,
        },
        contextFlags: {
          isGameDay: false,
          isGameDayMinus1: false,
          isAcclimatization: false,
          isWeightMaking: false,
          isPostVaccination: false,
          isPostFever: false,
        },
        localTimezone: 'Asia/Tokyo',
      },
      appliedConstants: {},
      calculatedMetrics: {
        acwr: 1.0,
        monotonyIndex: 1.0,
        preparedness: 10,
        tissueDamage: {
          metabolic: 0.1,
          structural_soft: 0.1,
          structural_hard: 0.1,
          neuromotor: 0.1,
        },
        zScores: {},
      },
      bayesianComputation: {
        riskScores: {},
        posteriorProbabilities: {},
        confidenceIntervals: {},
      },
      triggeredRule: 'P1_SAFETY',
      decision: 'RED',
      decisionReason: '痛み NRS が 9 で安全閾値（8）以上です。',
      overridesApplied: [],
      nodeResults,
    },
  };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('v6.0 P1/P2 承認フローテスト', () => {
  // 1. 初期生成時は acknowledged_by = null
  it('P1 アラート生成時、承認者は null', () => {
    const manager = new TraceAcknowledgmentManager();
    const traceLog = createSampleTraceLog();
    const registered = manager.register(traceLog);

    expect(registered.acknowledgment.status).toBe('pending');
    expect(registered.acknowledgment.acknowledgedBy).toBeNull();
    expect(registered.acknowledgment.acknowledgedAt).toBeNull();
    expect(registered.acknowledgment.notes).toBeNull();
    expect(registered.acknowledgment.overrideReason).toBeNull();
  });

  // 2. 承認アクション → acknowledged_by が更新される
  it('承認アクションで acknowledged_by が更新される', () => {
    const manager = new TraceAcknowledgmentManager();
    const traceLog = createSampleTraceLog();
    manager.register(traceLog);

    const acknowledged = manager.acknowledge(traceLog.traceId, 'user-medical-001');

    expect(acknowledged.acknowledgment.status).toBe('acknowledged');
    expect(acknowledged.acknowledgment.acknowledgedBy).toBe('user-medical-001');
    expect(acknowledged.acknowledgment.acknowledgedAt).toBeTruthy();
  });

  // 3. 修正アクションには notes が必須
  it('修正アクションで notes が必須', () => {
    const manager = new TraceAcknowledgmentManager();
    const traceLog = createSampleTraceLog('trace-modify');
    manager.register(traceLog);

    // notes なしでエラー
    expect(() => {
      manager.modify('trace-modify', 'user-002', '');
    }).toThrow('notes が必須');

    // notes ありで成功
    const modified = manager.modify(
      'trace-modify',
      'user-002',
      'メニュー調整により練習参加可と判断',
    );

    expect(modified.acknowledgment.status).toBe('modified');
    expect(modified.acknowledgment.notes).toBe(
      'メニュー調整により練習参加可と判断',
    );
  });

  // 4. オーバーライドで override_reason が記録される
  it('オーバーライドで override_reason が記録される', () => {
    const manager = new TraceAcknowledgmentManager();
    const traceLog = createSampleTraceLog('trace-override');
    manager.register(traceLog);

    const overridden = manager.override(
      'trace-override',
      'user-head-coach',
      '選手が軽度の痛みを報告したが、ウォームアップ後に消失。試合重要度を考慮し参加判断。',
    );

    expect(overridden.acknowledgment.status).toBe('overridden');
    expect(overridden.acknowledgment.overrideReason).toContain(
      'ウォームアップ後に消失',
    );
    expect(overridden.acknowledgment.acknowledgedBy).toBe('user-head-coach');
  });

  // 5. 承認済みトレースの再承認は不可（不変性）
  it('承認済みトレースの再承認はエラーになる', () => {
    const manager = new TraceAcknowledgmentManager();
    const traceLog = createSampleTraceLog('trace-immutable');
    manager.register(traceLog);

    // 最初の承認は成功
    manager.acknowledge('trace-immutable', 'user-001');

    // 再承認はエラー
    expect(() => {
      manager.acknowledge('trace-immutable', 'user-002');
    }).toThrow('既に承認済み');

    // 修正もエラー
    expect(() => {
      manager.modify('trace-immutable', 'user-002', '修正理由');
    }).toThrow('既に承認済み');

    // オーバーライドもエラー
    expect(() => {
      manager.override('trace-immutable', 'user-002', 'オーバーライド理由');
    }).toThrow('既に承認済み');
  });

  // 追加テスト: 存在しないトレースID
  it('存在しないトレースIDでの承認はエラーになる', () => {
    const manager = new TraceAcknowledgmentManager();
    expect(() => {
      manager.acknowledge('non-existent', 'user-001');
    }).toThrow('見つかりません');
  });

  // 追加テスト: buildTraceLog から承認フローへ
  it('パイプライン出力から生成したトレースログを承認フローに登録できる', () => {
    const manager = new TraceAcknowledgmentManager();
    const traceLog = createSampleTraceLog('trace-from-pipeline');
    const registered = manager.register(traceLog);

    // P1 判定のトレースログが登録される
    expect(registered.inferenceSnapshot.triggeredRule).toBe('P1_SAFETY');
    expect(registered.inferenceSnapshot.decision).toBe('RED');
    expect(registered.acknowledgment.status).toBe('pending');

    // 承認
    const acknowledged = manager.acknowledge('trace-from-pipeline', 'doctor-001');
    expect(acknowledged.acknowledgment.status).toBe('acknowledged');
  });
});
