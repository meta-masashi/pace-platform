# ADR-024: 6ステップスワイプ式チェックインUX

**ステータス:** 承認済み
**作成日:** 2026-03-24
**決定者:** @02-ui-ux, @03-frontend
**関連ADR:** ADR-020（EWMA）, ADR-023（AI coach）

---

## コンテキスト

チェックイン画面で収集するデータが Phase 5 v3.2 で増加した：

| v3.1 以前 | v3.2 追加 |
|---|---|
| NRS（痛み） | sleep_quality（睡眠の質） |
| sleep_score（睡眠スコア） | fatigue_feeling（主観的疲労感） |
| subjective_condition | srpe（昨日の練習負荷） |
| memo | — |

計 6〜7項目を1画面で入力させると認知負荷が高く、毎日の習慣化が困難になる。

## 決定

**「1画面1質問」スワイプ式（6ステップ）を採用する。**

### ステップ構成

| ステップ | キー | UI コンポーネント |
|---|---|---|
| 1 | nrs | NRSSlider（0〜10、11ボタン） |
| 2 | sleep_quality | SelectorRow（5択 + emoji） |
| 3 | subjective | SelectorRow（5択 + emoji） |
| 4 | fatigue_feeling | SelectorRow（5択 + emoji） |
| 5 | srpe | SRPESlider（0,10,20…100） |
| 6 | memo | TextInput（任意）+ 送信ボタン |

### アニメーション仕様

```typescript
// ステップ遷移: slide out → 即座に逆方向に移動 → spring でスライドイン
Animated.sequence([
  Animated.timing(slideAnim, { toValue: -direction * 40, duration: 100 }),
  Animated.timing(slideAnim, { toValue: direction * 40, duration: 0 }),
]).start(() => {
  setStep(next);
  Animated.spring(slideAnim, { tension: 120, friction: 10 }).start();
});
```

### プログレスバー

- 画面上部に `height: 4` のプログレスバー
- `width: \`${(step + 1) / STEPS.length * 100}%\`` でリニアに更新
- カラー: emerald `#10b981`

### 完了後フロー

1. `POST /api/athlete/checkin` で送信
2. 成功 → チェックマーク拡大アニメーション（`Animated.spring`）+ サマリー表示
3. 次回起動時は「提出済み」画面を表示（再提出不可）

## 代替案との比較

| UX パターン | メリット | デメリット |
|---|---|---|
| 1ページ全入力 | 一覧性が高い | 入力項目が多く離脱率が高い |
| **スワイプ式（採用）** | 1問ずつ集中できる・毎日続けやすい | 全体像が見えにくい |
| ボトムシート | 素早くアクセスできる | 画面が狭く入力しにくい |

## 結果

- 1ステップ平均 5〜10秒 × 6ステップ = 約 1分でチェックイン完了
- プログレスバーで「あと何問か」が視覚的に分かる
- チェックイン率向上の定量目標: 週間チェックイン率 ≥ 70%
