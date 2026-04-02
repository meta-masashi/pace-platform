# ADR-029: LLM 責務分離 — Node 0-4 への LLM 介入永続的禁止

**ステータス:** 承認済み
**作成日:** 2026-04-02
**決定者:** @04-backend, @05-architect, オーナー
**関連ADR:** ADR-002（スコアエンジン）, ADR-004（Gemini モデル）, ADR-023（AI デイリーコーチ）, ADR-028（AI Agent）
**準拠:** PACE v6.1 マスタープラン 絶対原則 A2

---

## コンテキスト

PACE v6 パイプラインは 6 層ノード構成（Node 0-5）で選手のコンディション判定を行う。
Gemini 2.0 Flash は複数の機能（InsightCard, SOAP ノート, デイリーコーチ, トレーニング計画）で使用されているが、
**LLM の出力がコンディション判定に混入するリスク** が存在する。

マスタープラン絶対原則 A2:
> 100%確定的判定: LLM 出力を判定に不使用

この原則を永続的な設計制約として ADR に記録し、将来の開発者が意図せず違反することを防ぐ。

## 決定

### 1. LLM 使用禁止ゾーン（Node 0-4）

以下のノードでは LLM（Gemini, GPT, Claude 等あらゆる生成 AI モデル）の呼び出しを **永続的に禁止** する。

| Node | 名称 | 処理内容 | LLM 使用 |
|------|------|---------|---------|
| Node 0 | Ingestion | 選手コンテキスト + EHR 取得 | **禁止** |
| Node 1 | Cleaning | 外れ値検出、欠損値補完、品質スコア | **禁止** |
| Node 2 | Feature Extraction | ACWR, Monotony, Z-Score, EWMA | **禁止** |
| Node 3 | Inference | ベイズ事後確率、リスクスコアリング | **禁止** |
| Node 4 | Decision | P1-P5 優先階層判定、推奨アクション | **禁止** |

### 2. LLM 使用許可ゾーン（Node 5 以降）

| 機能 | LLM の役割 | 判定への影響 |
|------|-----------|------------|
| Node 5: Presentation | 判定結果の自然言語化（NLG） | なし（表示のみ） |
| InsightCard | パーソナライズされたアドバイス生成 | なし（判定確定後の付加情報） |
| SOAP ノート | 臨床記録の文章化支援 | なし（スタッフの記録補助） |
| デイリーコーチ | 日次アドバイス生成 | なし（判定確定後の付加情報） |
| トレーニング計画 | 週次計画の草案生成 | なし（スタッフ承認必須） |
| Calendar イベント分類 | Function Calling で構造化抽出 | contextFlags への入力のみ（判定ロジック自体は確定的） |

### 3. 境界の厳格化ルール

1. **Node 0-4 のソースコードに `import` 文で Gemini/LLM クライアントを含めてはならない**
2. Node 5 の NLG 出力が Node 0-4 にフィードバックされるパスを作ってはならない
3. Calendar Function Calling の出力（isGameDay 等）は `contextFlags` として Node 4 に渡すが、これは **構造化された boolean 値** であり LLM の判断ではない
4. LLM ダウン時に判定品質が劣化してはならない（判定は LLM 非依存のため、影響なし）

### 4. LLM ダウン時フォールバック

| 機能 | フォールバック | ユーザー影響 |
|------|-------------|------------|
| InsightCard | テンプレートテキスト（Readiness + P1-P5 を埋め込み） | パーソナライズ低下 |
| SOAP ノート | 構造化データのみ表示 | 文章なし、データは閲覧可 |
| デイリーコーチ | 汎用アドバイステンプレート | パーソナライズ低下 |
| トレーニング計画 | エラー表示 + 手動作成を促す | スタッフが手動作成 |
| Calendar 分類 | デフォルト contextFlags（全 false） | 試合日等の自動検出なし |

### 5. CI による強制（推奨）

```typescript
// tests/security/llm-boundary.test.ts
// Node 0-4 のソースファイルに LLM クライアントの import がないことを検証
const NODE_0_4_FILES = glob('lib/engine/v6/nodes/node{0,1,2,3,4}*.ts');
for (const file of NODE_0_4_FILES) {
  const content = readFileSync(file, 'utf-8');
  expect(content).not.toContain('gemini');
  expect(content).not.toContain('openai');
  expect(content).not.toContain('anthropic');
  expect(content).not.toContain('langchain');
}
```

## 結果

- Node 0-4 のコンディション判定は 100% 確定的アルゴリズムで動作し続ける
- LLM は付加価値提供（NLG, アドバイス, 計画生成）に限定される
- LLM 障害時でも判定品質は一切劣化しない
- 将来の開発者がこの境界を破る場合は、本 ADR を明示的に廃止する ADR を作成する必要がある

## 補足: マスタープラン A2 原則の永続性

本 ADR は「A2 原則を永続的に維持する」という決定を記録するものである。
A2 原則の変更が必要になった場合は、以下の全てが必要:

1. 新しい ADR で A2 原則の変更理由を明示
2. Oxford CEBM Level 2+ のエビデンスで LLM 判定の妥当性を証明
3. オーナーの明示的承認
4. 判定品質の A/B テスト結果の提示
