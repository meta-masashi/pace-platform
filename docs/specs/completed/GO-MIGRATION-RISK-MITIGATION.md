# Go推論エンジン移行 リスク緩和設計書
## Risk Mitigation Design — PACE Inference Engine Go Migration

**作成日**: 2026-04-01
**ステータス**: 設計レビュー待ち

---

## 1. リスク一覧と深刻度評価

| # | リスク | 深刻度 | 発生確率 | 影響度 | 緩和戦略 |
|---|--------|--------|---------|--------|---------|
| R1 | 動作の不一致（TypeScript と Go で異なる判定） | **CRITICAL** | 中 | 極高 | 差分テスト + 並行運用 |
| R2 | 浮動小数点演算の差異 | **HIGH** | 高 | 高 | イプシロン比較 + 固定精度 |
| R3 | Gemini SDK 不在（Go 版なし） | **MEDIUM** | 確定 | 中 | Node5 を Next.js 側に残す |
| R4 | デプロイ障害時のフォールバック | **CRITICAL** | 低 | 極高 | TypeScript 版を常時待機 |
| R5 | API 契約変更によるフロント破壊 | **HIGH** | 中 | 高 | JSON Schema 契約テスト |
| R6 | Go サービスのメモリリーク/パニック | **MEDIUM** | 低 | 高 | goroutine リカバリー + ヘルスチェック |
| R7 | 設定ファイルの不整合 | **HIGH** | 中 | 高 | 設定の単一ソース + バリデーション |
| R8 | ネットワークレイテンシ追加（サービス間通信） | **LOW** | 確定 | 低 | ローカル通信 + コネクションプール |

---

## 2. R1: 動作不一致の緩和（最重要）

### 2-1. 3段階検証フレームワーク

```
【Stage 1: 単体テスト — 関数レベル一致】
  TypeScript の各関数の入出力を JSON fixtures として保存。
  Go 側で同じ fixtures を読み込み、出力が一致することを確認。

【Stage 2: 統合テスト — パイプライン全体一致】
  DailyInput + AthleteContext の完全なテストケースを 50+ 件作成。
  TypeScript と Go の両方に流し、PipelineOutput を比較。

【Stage 3: 並行運用（Shadow Mode）— 本番データ一致】
  本番リクエストを TypeScript で処理（結果を返す）。
  同時に Go にも送信（結果は破棄、ログのみ）。
  不一致を検出したら即座にアラート。
```

### 2-2. テストケース設計（50件）

#### P1 Safety テスト（10件）
| # | 入力条件 | 期待判定 | 検証ポイント |
|---|---------|---------|------------|
| T01 | painNRS=8, 他全て正常 | RED/P1 | Pain 閾値境界 |
| T02 | painNRS=9, NSAID=true | NOT P1 | NSAID マスキング |
| T03 | sleep=2, fatigue=8 | RED/P1 | 複合ルール境界 |
| T04 | sleep=3, fatigue=8 | NOT P1 | 複合ルール非発火 |
| T05 | sleep=2, fatigue=7 | NOT P1 | 複合ルール非発火 |
| T06 | postFever=true | RED/P1 | フラグ発火 |
| T07 | postVaccination=true | RED/P1 | フラグ発火 |
| T08 | HR Z-Score=2.1 | RED/P1 | HR スパイク |
| T09 | HR Z-Score=2.1, acclimatization=true | NOT P1 (HR) | 順化ミュート |
| T10 | painNRS=10, contactSport=true, painType=traumatic | NOT P1 (pain) | コンタクト緩和 |

#### P2 Mechanical Risk テスト（8件）
| # | 入力条件 | 期待判定 | 検証ポイント |
|---|---------|---------|------------|
| T11 | ACWR=1.8, wellness decline 2項目 | RED/P2 | 複合条件（RED） |
| T12 | ACWR=1.8, wellness decline 0項目 | ORANGE/P2 | ACWR のみ（ORANGE） |
| T13 | ACWR=1.4, wellness decline 3項目 | NOT P2 | ACWR 閾値未到達 |
| T14 | ACWR=1.35, age=15 | ORANGE/P2 | PHV 補正（1.5×0.867≈1.3） |
| T15 | ACWR=1.35, age=25 | NOT P2 | 成人は 1.5 閾値 |
| T16 | ACWR=2.0, wellness decline 3項目, painNRS=9 | RED/P1 | P1 が P2 に優先 |
| T17 | Monotony=3.0, ACWR=1.0 | NOT P2 | Monotony 単独不発火 |
| T18 | ACWR=1.6, Z sleepQuality=-1.1, Z fatigue=-1.2 | RED/P2 | Z≤-1.0 が 2項目 |

#### P3 Chronic Maladaptation テスト（6件）
| # | 入力条件 | 期待判定 | 検証ポイント |
|---|---------|---------|------------|
| T19 | ACWR=1.0, Z≤-1.5 が 3項目 | YELLOW/P3 | 正常 ACWR + 悪化 |
| T20 | ACWR=1.0, Z≤-1.5 が 2項目 | NOT P3 | 3項目未満 |
| T21 | ACWR=1.4, Z≤-1.5 が 3項目 | NOT P3 | ACWR 正常域外 |
| T22 | ACWR=0.7, Z≤-1.5 が 3項目 | NOT P3 | ACWR 低すぎ |
| T23 | ACWR=1.1, Z sleep=-2.0, Z fatigue=-1.8, Z mood=-1.6 | YELLOW/P3 | 3項目具体値 |
| T24 | ACWR=1.1, Z sleep=-2.0, Z fatigue=-1.8 | NOT P3 | 2項目のみ |

#### P4 GAS / Allostatic テスト（6件）
| # | 入力条件 | 期待判定 | 検証ポイント |
|---|---------|---------|------------|
| T25 | Z≤-1.5 が 2項目, ACWR正常 | YELLOW/P4 | GAS 基本 |
| T26 | Z≤-1.5 が 2項目, gameDay=true | NOT P4 | 試合日緩和 |
| T27 | sRPE=3, Z sleep≤-1.5, Z fatigue≥1.5 | YELLOW/P4b | アロスタティック |
| T28 | sRPE=5, Z sleep≤-1.5, Z fatigue≥1.5 | NOT P4b | sRPE 閾値超 |
| T29 | Z≤-1.5 が 2項目, weightMaking=true | NOT P4 | 減量期緩和 |
| T30 | Z≤-1.5 が 2項目, acclimatization=true | NOT P4 | 順化期緩和 |

#### P5 Normal / Edge Cases テスト（8件）
| # | 入力条件 | 期待判定 | 検証ポイント |
|---|---------|---------|------------|
| T31 | 全て正常値 | GREEN/P5 | 正常パス |
| T32 | 全て 0（最小値） | GREEN/P5 | 下限境界 |
| T33 | 全て 10（最大値、pain含む） | RED/P1 | 上限で P1 発火 |
| T34 | validDataDays=5（セーフティモード） | GREEN/P5 | Z-Score 無効 |
| T35 | validDataDays=14（学習開始） | 判定依存 | Z-Score 50% 重み |
| T36 | validDataDays=28（フルモード） | 判定依存 | Z-Score 100% 重み |
| T37 | history 空配列 | GREEN/P5 | 履歴なし |
| T38 | lastKnownRecord なし、gap>14日 | GREEN/P5 | 中立デフォルト |

#### 新機能テスト（12件）
| # | 入力条件 | 期待判定 | 検証ポイント |
|---|---------|---------|------------|
| T39 | qualityScore=0.5, パイプライン GREEN | YELLOW + expert_review | 品質ゲート発動 |
| T40 | qualityScore=0.5, パイプライン RED | RED（上書きなし） | RED は保護 |
| T41 | qualityScore=0.8, パイプライン GREEN | GREEN（ゲート不発火） | 閾値未満 |
| T42 | ACWR 3日間: 1.2→1.3→1.4 | trend_notice: ACWR approaching | 傾向検出（上昇） |
| T43 | ACWR 3日間: 1.4→1.3→1.2 | trend_notice なし | 傾向検出（下降は安全） |
| T44 | ACWR 3日間: 1.0→1.0→1.0 | trend_notice なし | 変化なし |
| T45 | confidence="low", GREEN | YELLOW + expert delegation | 専門家委譲 |
| T46 | confidence="high", GREEN | GREEN（委譲なし） | 高信頼度 |
| T47 | Day 14: Z-Score 重み 50% | 数値検証 | 段階的 Z-Score |
| T48 | Day 22: Z-Score 重み 75% | 数値検証 | 段階的 Z-Score |
| T49 | Day 28: Z-Score 重み 100% | 数値検証 | 段階的 Z-Score |
| T50 | Day 13: Z-Score 重み 0% | Z-Score 空 | セーフティモード |

### 2-3. 差分検出の自動化

```
【CI パイプラインに組み込み】

1. shared-fixtures/ ディレクトリに 50 件の JSON テストケースを格納
   ├ input.json    （DailyInput + AthleteContext + History）
   ├ expected.json （PipelineOutput の期待値）
   └ metadata.json （テストID、説明、検証ポイント）

2. TypeScript テスト（vitest）
   for each fixture:
     output = await pipeline.execute(fixture.input)
     assert(output.decision === fixture.expected.decision)
     assert(output.priority === fixture.expected.priority)
     assertFloatEqual(output.featureVector.acwr, fixture.expected.acwr, 1e-9)

3. Go テスト（go test）
   for each fixture:
     output := pipeline.Execute(fixture.Input)
     assert.Equal(t, fixture.Expected.Decision, output.Decision)
     assert.Equal(t, fixture.Expected.Priority, output.Priority)
     assert.InEpsilon(t, fixture.Expected.ACWR, output.FeatureVector.ACWR, 1e-9)

4. CI ステップ: 「TS と Go の出力が全 50 件で一致」が必須
```

---

## 3. R2: 浮動小数点演算の差異

### 問題
TypeScript の `Number` は IEEE 754 倍精度（64bit）。Go の `float64` も同じ。しかし演算順序、最適化、丸めモードの違いで微小な差異が発生し得る。

### 緩和策

```go
// Go側: 全比較にイプシロン（1e-9）を使用
const FloatEpsilon = 1e-9

func FloatEqual(a, b float64) bool {
    return math.Abs(a-b) < FloatEpsilon
}

// 判定に影響する閾値近傍の値を特別に検証
// 例: ACWR=1.4999999 vs ACWR=1.5000001 で判定が変わる
// → 閾値 ±0.01 の範囲を「グレーゾーン」として両方の判定を許容
func IsNearThreshold(value, threshold float64) bool {
    return math.Abs(value-threshold) < 0.01
}
```

### 閾値近傍のテストケース

| 値 | 閾値 | TypeScript判定 | Go判定 | 許容 |
|----|------|---------------|--------|------|
| ACWR=1.4999 | 1.5 | NOT P2 | NOT P2 | 一致必須 |
| ACWR=1.5001 | 1.5 | P2 | P2 | 一致必須 |
| ACWR=1.5000 | 1.5 | 境界 | 境界 | どちらも許容 |
| Z=-1.4999 | -1.5 | NOT exhaustion | NOT exhaustion | 一致必須 |
| Z=-1.5001 | -1.5 | exhaustion | exhaustion | 一致必須 |

---

## 4. R4: デプロイ障害時のフォールバック（最重要）

### 設計原則

**TypeScript 版は削除しない。Go 版がダウンした場合、即座にTypeScript版にフォールバックする。**

```
Next.js API (/api/pipeline)
  │
  ├─→ [1] Go サービス呼び出し（タイムアウト 3秒）
  │     ├─ 成功 → Go の結果を返す
  │     └─ 失敗 → [2] へ
  │
  └─→ [2] TypeScript パイプライン実行（フォールバック）
        ├─ 成功 → TS の結果を返す（warning: "Go engine unavailable"）
        └─ 失敗 → エラー応答
```

### 実装

```typescript
// /api/pipeline/route.ts（修正後）

async function executeInference(input: DailyInput, context: AthleteContext): Promise<PipelineOutput> {
  // Phase 1: Go エンジンを試行
  try {
    const goResult = await fetchWithTimeout(
      `${GO_ENGINE_URL}/v6/infer`,
      { method: 'POST', body: JSON.stringify({ athlete_context: context, daily_input: input, history }) },
      3000 // 3秒タイムアウト
    );
    if (goResult.ok) {
      const output = await goResult.json();
      return { ...output, engine: 'go' };
    }
  } catch {
    console.warn('[pipeline] Go engine unavailable, falling back to TypeScript');
  }

  // Phase 2: TypeScript フォールバック
  const pipeline = new InferencePipeline();
  const output = await pipeline.execute(input, context);
  return { ...output, engine: 'typescript', warning: 'Go engine unavailable' };
}
```

### フォールバック条件

| 条件 | 動作 | ログ |
|------|------|------|
| Go 正常応答（200） | Go 結果を使用 | `engine=go` |
| Go タイムアウト（3秒） | TS フォールバック | `engine=ts, reason=timeout` |
| Go エラー応答（5xx） | TS フォールバック | `engine=ts, reason=server_error` |
| Go 接続拒否 | TS フォールバック | `engine=ts, reason=connection_refused` |
| Go 判定不一致（Shadow Mode中） | TS 結果を使用 + アラート | `engine=ts, reason=mismatch` |

---

## 5. R5: API 契約テスト

### JSON Schema による契約固定

```json
// shared-contracts/v6-infer-response.schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["trace_id", "athlete_id", "timestamp", "decision", "feature_vector", "data_quality", "pipeline_version"],
  "properties": {
    "decision": {
      "type": "object",
      "required": ["decision", "priority", "reason", "reason_en", "overrides_applied", "recommended_actions"],
      "properties": {
        "decision": { "enum": ["RED", "ORANGE", "YELLOW", "GREEN"] },
        "priority": { "enum": ["P1_SAFETY", "P2_MECHANICAL_RISK", "P3_DECOUPLING", "P4_GAS_EXHAUSTION", "P5_NORMAL"] },
        "confidence_level": { "enum": ["high", "medium", "low"] }
      }
    },
    "expert_review_required": { "type": "boolean" },
    "trend_notices": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["metric", "direction", "current_value", "threshold", "message"]
      }
    }
  }
}
```

### CI での検証

```
1. Go テスト: 全出力が JSON Schema に準拠
2. TypeScript テスト: 同じ Schema で検証
3. CI: スキーマファイルが変更されたら、両方のテストが再実行される
```

---

## 6. R6: Go サービスの堅牢性

### パニックリカバリー

```go
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    defer func() {
        if err := recover(); err != nil {
            log.Error("panic recovered", "error", err, "stack", debug.Stack())
            // パニック時は 500 ではなく、TypeScript フォールバックを促す
            w.Header().Set("X-Engine-Status", "panic")
            w.WriteHeader(http.StatusServiceUnavailable)
            json.NewEncoder(w).Encode(map[string]string{
                "error": "internal engine error",
                "fallback": "use_typescript",
            })
        }
    }()
    // ... 通常処理
}
```

### ヘルスチェック

```go
// GET /health
// Kubernetes/Cloud Run のライブネスプローブ用
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
    // 1. メモリ使用量チェック（512MB超で unhealthy）
    var m runtime.MemStats
    runtime.ReadMemStats(&m)
    if m.Alloc > 512*1024*1024 {
        w.WriteHeader(http.StatusServiceUnavailable)
        return
    }

    // 2. テスト推論実行（正常に計算できるか）
    testOutput := pipeline.Execute(testFixture)
    if testOutput.Decision.Decision != "GREEN" {
        w.WriteHeader(http.StatusServiceUnavailable)
        return
    }

    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{
        "status": "ok",
        "version": "v6.0-go",
        "memory_mb": fmt.Sprintf("%.1f", float64(m.Alloc)/1024/1024),
    })
}
```

### goroutine リーク防止

```go
// 全推論にコンテキストタイムアウトを適用
func (p *Pipeline) Execute(ctx context.Context, state *PipelineState) error {
    ctx, cancel := context.WithTimeout(ctx, 5*time.Second) // パイプライン全体 5秒
    defer cancel()

    for _, node := range p.nodes {
        select {
        case <-ctx.Done():
            return fmt.Errorf("pipeline timeout: %w", ctx.Err())
        default:
            if err := node(ctx, state); err != nil {
                state.Warnings = append(state.Warnings, err.Error())
                // フォールバック値を設定して続行
            }
        }
    }
    return nil
}
```

---

## 7. R7: 設定の単一ソース

### 問題
TypeScript の `config.ts` と Go の `default.yaml` で閾値が異なるリスク。

### 解決: 共有設定ファイル

```
pace-inference/
  config/
    default.yaml          ← 唯一の設定ソース

pace-platform/
  lib/engine/v6/
    config.ts             ← default.yaml から自動生成（CI で検証）
```

### CI 検証ステップ

```yaml
# .github/workflows/ci.yml
- name: Verify config consistency
  run: |
    # Go の default.yaml から TypeScript の config.ts を生成
    go run tools/gen-ts-config/main.go > /tmp/generated-config.ts
    # 生成された config.ts と実際の config.ts を比較
    diff /tmp/generated-config.ts pace-platform/lib/engine/v6/config.ts
    # 差異があれば CI 失敗
```

---

## 8. 並行運用（Shadow Mode）ロードマップ

```
【Week 1-4: Go 実装 + 単体テスト】
  ↓ 50 件の fixture テスト全パス

【Week 5: Shadow Mode 開始】
  TypeScript が本番判定を返す（変更なし）
  Go にも同じリクエストを送信（結果は破棄）
  不一致をログに記録 + Slack アラート
  ↓ 1週間の不一致率を測定

【Week 6: Shadow Mode 結果評価】
  不一致率 < 0.1% → Week 7 へ進む
  不一致率 > 0.1% → 原因調査、修正、Shadow Mode 延長
  ↓

【Week 7: カナリアリリース（10%）】
  10% のリクエストを Go で処理
  90% は TypeScript のまま
  レイテンシ、エラー率、判定分布を監視
  ↓ 1週間の安定性確認

【Week 8: 段階ロールアウト（50% → 100%）】
  50% → 2日間安定 → 100%
  TypeScript 版は待機モードで維持（即時フォールバック可能）

【Month 3+: TypeScript 版の段階的廃止】
  Go が 1ヶ月間 100% 安定稼働を確認後
  TypeScript パイプラインコードを deprecated マーク
  6ヶ月後に完全削除（フォールバック不要を確認）
```

---

## 9. 監視とアラート

| メトリクス | 正常範囲 | アラート条件 | 対応 |
|-----------|---------|------------|------|
| Go レイテンシ (p99) | < 100ms | > 500ms | TS フォールバック検討 |
| Go エラー率 | < 0.01% | > 1% | 即時 TS フォールバック |
| TS/Go 判定不一致率 | 0% | > 0% | 原因調査 + アラート |
| Go メモリ使用量 | < 256MB | > 512MB | サービス再起動 |
| ヘルスチェック失敗 | 0 | 3回連続失敗 | サービス再起動 + TS フォールバック |
| パイプラインタイムアウト | 0 | > 0 | ログ調査 |

---

## 10. ロールバック手順

### 即時ロールバック（5分以内）

```
1. 環境変数 GO_ENGINE_ENABLED=false をセット
2. Next.js が自動的に TypeScript フォールバックを使用
3. Go サービスは停止不要（リクエストが来なくなるだけ）
```

### 完全ロールバック（30分以内）

```
1. GO_ENGINE_ENABLED=false
2. Go サービスのデプロイメントを 0 レプリカにスケールダウン
3. /api/pipeline/route.ts から Go 呼び出しコードを削除（git revert）
4. デプロイ
```

### ロールバックトリガー

| 条件 | 自動/手動 | アクション |
|------|----------|-----------|
| Go エラー率 > 5% | **自動** | GO_ENGINE_ENABLED=false |
| 判定不一致 3件以上/時 | **手動** | 原因調査後にロールバック判断 |
| Go レイテンシ p99 > 3秒 | **自動** | GO_ENGINE_ENABLED=false |
| ヘルスチェック 5分間失敗 | **自動** | TS フォールバック + アラート |

---

## 11. セキュリティ考慮事項

### Go サービスのネットワーク分離

```
Next.js (Vercel) → [内部ネットワーク] → Go サービス (Cloud Run)
                     ↑ 外部からアクセス不可
```

- Go サービスは内部 IP のみ公開（外部からアクセス不可）
- Next.js → Go は内部 HTTP（TLS 不要、レイテンシ最小化）
- Go サービスに認証ヘッダーは不要（ネットワーク分離で保護）
- Go サービスはステートレス（セッション/Cookie 不使用）

### Go 依存関係のセキュリティ

```
go.sum: 全依存の SHA-256 ハッシュ固定
govulncheck: CI で毎回実行
依存数: ~10 パッケージ（標準ライブラリ中心）
  - net/http（HTTP サーバー）
  - encoding/json（JSON パース）
  - math（数学関数）
  - log/slog（構造化ロギング）
  - gopkg.in/yaml.v3（設定読み込み）
```
