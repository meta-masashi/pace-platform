/**
 * tests/unit/causal-discounting-dag.test.ts
 * ============================================================
 * Causal Discounting DAG 推論エンジンの単体テスト
 *
 * 対象: lib/bayes/inference.ts
 *   - probabilityToOdds()
 *   - oddsToProbability()
 *   - computeEffectiveLR()
 *   - calculatePosteriorWithDAG()
 *
 * テストシナリオ:
 *   - ナイーブベイズとの二重カウント防止検証
 *   - 親ノード未発火時の割引なし検証
 *   - 複数親ノードの累積割引検証
 *   - エッジケース（事前確率 0/1, 空観測, 不明ノード）
 * ============================================================
 */

import { describe, it, expect } from "vitest";
import {
  probabilityToOdds,
  oddsToProbability,
  computeEffectiveLR,
  calculatePosteriorWithDAG,
} from "../../lib/bayes/inference";
import type { AssessmentNode, CausalEdge, ActiveObservation } from "../../lib/bayes/types";

// ---------------------------------------------------------------------------
// ヘルパー: テスト用の最小 AssessmentNode を生成
// ---------------------------------------------------------------------------

function createTestNode(
  overrides: Partial<AssessmentNode> & { node_id: string; lr_yes: number }
): AssessmentNode {
  return {
    source: "test",
    category: "test",
    axis_type: "functional",
    unit: "binary",
    lr_no: 0.5,
    base_lr: 1.0,
    evidence_level: "B",
    description: "テスト用ノード",
    pace_annotation: null,
    prescription_tags: [],
    contraindication_tags: [],
    is_active: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// probabilityToOdds / oddsToProbability
// ---------------------------------------------------------------------------

describe("probabilityToOdds", () => {
  it("確率 0.5 をオッズ 1.0 に変換する", () => {
    expect(probabilityToOdds(0.5)).toBeCloseTo(1.0, 10);
  });

  it("確率 0.05 をオッズ 0.05263... に変換する", () => {
    // 0.05 / (1 - 0.05) = 0.05 / 0.95 ≈ 0.052631578...
    expect(probabilityToOdds(0.05)).toBeCloseTo(0.05 / 0.95, 8);
  });

  it("確率 0.9 をオッズ 9.0 に変換する", () => {
    expect(probabilityToOdds(0.9)).toBeCloseTo(9.0, 8);
  });

  it("確率が極めて小さい場合でも数値的に安定", () => {
    const odds = probabilityToOdds(0.0001);
    expect(odds).toBeGreaterThan(0);
    expect(Number.isFinite(odds)).toBe(true);
  });

  it("確率が 0 に近い場合でもクランプにより安全", () => {
    const odds = probabilityToOdds(0);
    expect(odds).toBeGreaterThan(0);
    expect(Number.isFinite(odds)).toBe(true);
  });
});

describe("oddsToProbability", () => {
  it("オッズ 1.0 を確率 0.5 に変換する", () => {
    expect(oddsToProbability(1.0)).toBeCloseTo(0.5, 10);
  });

  it("オッズ 9.0 を確率 0.9 に変換する", () => {
    expect(oddsToProbability(9.0)).toBeCloseTo(0.9, 8);
  });

  it("負のオッズは確率 0 を返す", () => {
    expect(oddsToProbability(-1)).toBe(0);
  });

  it("無限大のオッズは確率 1.0 を返す", () => {
    expect(oddsToProbability(Infinity)).toBe(1.0);
  });

  it("確率 → オッズ → 確率のラウンドトリップが一致する", () => {
    const original = 0.37;
    const roundTripped = oddsToProbability(probabilityToOdds(original));
    expect(roundTripped).toBeCloseTo(original, 10);
  });
});

// ---------------------------------------------------------------------------
// computeEffectiveLR
// ---------------------------------------------------------------------------

describe("computeEffectiveLR", () => {
  it("親ノードが発火していない場合、LR がそのまま返る（割引なし）", () => {
    const result = computeEffectiveLR(11.67, []);
    expect(result).toBe(11.67);
  });

  it("LR が 1.0 の場合、親の発火に関係なく 1.0 を返す", () => {
    const edges: CausalEdge[] = [{ parentId: "P1", discountFactor: 0.9 }];
    expect(computeEffectiveLR(1.0, edges)).toBe(1.0);
  });

  it("仕様例: LR=4.0, γ=0.8 の場合 → Effective LR = 1.6", () => {
    const edges: CausalEdge[] = [{ parentId: "P1", discountFactor: 0.8 }];
    const result = computeEffectiveLR(4.0, edges);
    // 1 + (4.0 - 1) * (1 - 0.8) = 1 + 3.0 * 0.2 = 1.6
    expect(result).toBeCloseTo(1.6, 10);
  });

  it("テストケース: LR=11.67, γ=0.85 の場合 → Effective LR = 2.6005", () => {
    const edges: CausalEdge[] = [{ parentId: "F2_001", discountFactor: 0.85 }];
    const result = computeEffectiveLR(11.67, edges);
    // 1 + (11.67 - 1) * (1 - 0.85) = 1 + 10.67 * 0.15 = 2.6005
    expect(result).toBeCloseTo(2.6005, 4);
  });

  it("γ=0.0（割引なし）の場合、元の LR がそのまま返る", () => {
    const edges: CausalEdge[] = [{ parentId: "P1", discountFactor: 0 }];
    expect(computeEffectiveLR(5.0, edges)).toBeCloseTo(5.0, 10);
  });

  it("γ=1.0（完全割引）の場合、Effective LR = 1.0", () => {
    const edges: CausalEdge[] = [{ parentId: "P1", discountFactor: 1.0 }];
    expect(computeEffectiveLR(5.0, edges)).toBeCloseTo(1.0, 10);
  });

  it("複数親ノードが発火: 累積割引 (1-γ1)*(1-γ2) が適用される", () => {
    const edges: CausalEdge[] = [
      { parentId: "P1", discountFactor: 0.5 },
      { parentId: "P2", discountFactor: 0.4 },
    ];
    const result = computeEffectiveLR(6.0, edges);
    // retainedFraction = (1-0.5) * (1-0.4) = 0.5 * 0.6 = 0.3
    // Effective LR = 1 + (6.0 - 1) * 0.3 = 1 + 1.5 = 2.5
    expect(result).toBeCloseTo(2.5, 10);
  });

  it("discountFactor が範囲外の場合クランプされる", () => {
    const edgesNeg: CausalEdge[] = [{ parentId: "P1", discountFactor: -0.5 }];
    expect(computeEffectiveLR(3.0, edgesNeg)).toBeCloseTo(3.0, 10); // γ=0 と同等

    const edgesOver: CausalEdge[] = [{ parentId: "P1", discountFactor: 1.5 }];
    expect(computeEffectiveLR(3.0, edgesOver)).toBeCloseTo(1.0, 10); // γ=1 と同等
  });
});

// ---------------------------------------------------------------------------
// calculatePosteriorWithDAG — メインテストケース
// ---------------------------------------------------------------------------

describe("calculatePosteriorWithDAG", () => {
  // テスト用マスターデータ
  const nodeA = createTestNode({
    node_id: "F2_001",
    lr_yes: 4.6,
    // 親ノードなし（ルートノード）
  });

  const nodeB = createTestNode({
    node_id: "F1_001",
    lr_yes: 11.67,
    parents: [{ parentId: "F2_001", discountFactor: 0.85 }],
  });

  const allNodes: AssessmentNode[] = [nodeA, nodeB];
  const priorProbability = 0.05;

  // -----------------------------------------------------------------------
  // ケース 1: Node B のみ発火（割引なし）
  // -----------------------------------------------------------------------

  it("ケース1: Node B のみ発火 → Effective LR = 11.67, 事後確率 ≈ 38.0%", () => {
    const observations: ActiveObservation[] = [
      { node_id: "F1_001", is_active: true },
    ];

    const posterior = calculatePosteriorWithDAG(
      priorProbability,
      allNodes,
      observations
    );

    // 計算検証:
    // priorOdds = 0.05 / 0.95 = 0.0526315...
    // posteriorOdds = 0.0526315... * 11.67 = 0.6142...
    // posterior = 0.6142... / 1.6142... ≈ 0.3805...
    expect(posterior).toBeCloseTo(0.3805, 2);
  });

  // -----------------------------------------------------------------------
  // ケース 2: Node A と Node B が両方発火（因果割引適用）
  // -----------------------------------------------------------------------

  it("ケース2: Node A + B 両方発火 → 因果割引で二重カウント防止, 事後確率 ≈ 38.6%", () => {
    const observations: ActiveObservation[] = [
      { node_id: "F2_001", is_active: true },
      { node_id: "F1_001", is_active: true },
    ];

    const posterior = calculatePosteriorWithDAG(
      priorProbability,
      allNodes,
      observations
    );

    // 計算検証:
    // Node A: Effective LR = 4.6（親なし、割引なし）
    // Node B: Effective LR = 1 + (11.67 - 1) * (1 - 0.85) = 2.6005
    // トータル実効 LR = 4.6 * 2.6005 = 11.9623
    // priorOdds = 0.05 / 0.95 = 0.0526315...
    // posteriorOdds = 0.0526315... * 11.9623 = 0.6296...
    // posterior = 0.6296... / 1.6296... ≈ 0.3863...
    expect(posterior).toBeCloseTo(0.386, 2);
  });

  // -----------------------------------------------------------------------
  // 二重カウント防止の検証
  // -----------------------------------------------------------------------

  it("ナイーブベイズ（割引なし）と比較して、DAG 推論の事後確率が低い", () => {
    const observations: ActiveObservation[] = [
      { node_id: "F2_001", is_active: true },
      { node_id: "F1_001", is_active: true },
    ];

    const dagPosterior = calculatePosteriorWithDAG(
      priorProbability,
      allNodes,
      observations
    );

    // ナイーブベイズ相当（割引なしで計算）
    const nodesWithoutParents = allNodes.map((n) => {
      const { parents: _p, ...rest } = n;
      return rest;
    }) as typeof allNodes;
    const naivePosterior = calculatePosteriorWithDAG(
      priorProbability,
      nodesWithoutParents,
      observations
    );

    // ナイーブベイズ: LR = 4.6 * 11.67 = 53.682
    // priorOdds = 0.0526315...
    // posteriorOdds = 0.0526315... * 53.682 = 2.8254...
    // posterior ≈ 0.7386...（73.9%）
    expect(naivePosterior).toBeGreaterThan(0.70);

    // DAG: posterior ≈ 38.6% << 73.9%（二重カウントが防止されている）
    expect(dagPosterior).toBeLessThan(naivePosterior);
    expect(dagPosterior).toBeLessThan(0.45);
  });
});

// ---------------------------------------------------------------------------
// エッジケーステスト
// ---------------------------------------------------------------------------

describe("calculatePosteriorWithDAG — エッジケース", () => {
  const simpleNode = createTestNode({ node_id: "N1", lr_yes: 3.0 });

  it("事前確率 0 の場合、常に 0 を返す", () => {
    const observations: ActiveObservation[] = [
      { node_id: "N1", is_active: true },
    ];
    expect(calculatePosteriorWithDAG(0, [simpleNode], observations)).toBe(0);
  });

  it("事前確率 1 の場合、常に 1 を返す", () => {
    const observations: ActiveObservation[] = [
      { node_id: "N1", is_active: true },
    ];
    expect(calculatePosteriorWithDAG(1, [simpleNode], observations)).toBe(1);
  });

  it("空の観測配列の場合、事前確率がそのまま返る", () => {
    expect(calculatePosteriorWithDAG(0.3, [simpleNode], [])).toBe(0.3);
  });

  it("全ての観測が is_active = false の場合、事前確率がそのまま返る", () => {
    const observations: ActiveObservation[] = [
      { node_id: "N1", is_active: false },
    ];
    expect(calculatePosteriorWithDAG(0.3, [simpleNode], observations)).toBe(0.3);
  });

  it("マスターデータに存在しないノード ID は無視される", () => {
    const observations: ActiveObservation[] = [
      { node_id: "NONEXISTENT", is_active: true },
    ];
    // console.warn が出るが、事前確率がそのまま返る
    expect(calculatePosteriorWithDAG(0.3, [simpleNode], observations)).toBe(0.3);
  });

  it("事前確率が範囲外の場合エラーが投げられる", () => {
    expect(() =>
      calculatePosteriorWithDAG(-0.1, [simpleNode], [])
    ).toThrow("事前確率は [0, 1] の範囲");

    expect(() =>
      calculatePosteriorWithDAG(1.5, [simpleNode], [])
    ).toThrow("事前確率は [0, 1] の範囲");
  });

  it("単一ノード発火で事後確率が事前確率より上昇する（LR > 1 の場合）", () => {
    const observations: ActiveObservation[] = [
      { node_id: "N1", is_active: true },
    ];
    const posterior = calculatePosteriorWithDAG(0.1, [simpleNode], observations);
    expect(posterior).toBeGreaterThan(0.1);
  });

  it("親ノードの定義はあるが親が発火していない場合、割引は適用されない", () => {
    const childNode = createTestNode({
      node_id: "CHILD",
      lr_yes: 5.0,
      parents: [{ parentId: "PARENT", discountFactor: 0.9 }],
    });
    const parentNode = createTestNode({
      node_id: "PARENT",
      lr_yes: 2.0,
    });

    // 子ノードのみ発火（親は発火していない）
    const observations: ActiveObservation[] = [
      { node_id: "CHILD", is_active: true },
    ];

    const posterior = calculatePosteriorWithDAG(
      0.1,
      [childNode, parentNode],
      observations
    );

    // LR = 5.0（割引なし）で計算される
    const priorOdds = 0.1 / 0.9;
    const expectedOdds = priorOdds * 5.0;
    const expectedPosterior = expectedOdds / (1 + expectedOdds);

    expect(posterior).toBeCloseTo(expectedPosterior, 8);
  });
});

// ---------------------------------------------------------------------------
// 複数親ノードの累積割引テスト
// ---------------------------------------------------------------------------

describe("calculatePosteriorWithDAG — 複数親ノード", () => {
  it("3 つの親ノードが全て発火した場合の累積割引", () => {
    const parent1 = createTestNode({ node_id: "P1", lr_yes: 2.0 });
    const parent2 = createTestNode({ node_id: "P2", lr_yes: 3.0 });
    const parent3 = createTestNode({ node_id: "P3", lr_yes: 1.5 });
    const child = createTestNode({
      node_id: "CHILD",
      lr_yes: 10.0,
      parents: [
        { parentId: "P1", discountFactor: 0.5 },
        { parentId: "P2", discountFactor: 0.3 },
        { parentId: "P3", discountFactor: 0.4 },
      ],
    });

    const observations: ActiveObservation[] = [
      { node_id: "P1", is_active: true },
      { node_id: "P2", is_active: true },
      { node_id: "P3", is_active: true },
      { node_id: "CHILD", is_active: true },
    ];

    const posterior = calculatePosteriorWithDAG(
      0.05,
      [parent1, parent2, parent3, child],
      observations
    );

    // 子ノードの Effective LR:
    // retainedFraction = (1-0.5) * (1-0.3) * (1-0.4) = 0.5 * 0.7 * 0.6 = 0.21
    // Effective LR = 1 + (10.0 - 1) * 0.21 = 1 + 1.89 = 2.89
    const childEffectiveLR = 2.89;
    const totalLR = 2.0 * 3.0 * 1.5 * childEffectiveLR;
    const priorOdds = 0.05 / 0.95;
    const expectedOdds = priorOdds * totalLR;
    const expectedPosterior = expectedOdds / (1 + expectedOdds);

    expect(posterior).toBeCloseTo(expectedPosterior, 3);
  });
});
