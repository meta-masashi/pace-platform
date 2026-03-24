# ADR-027: TeleHealthビデオ通話アーキテクチャ

**ステータス:** 承認済み
**作成日:** 2026-03-24
**決定者:** @05-architect, @01-pm, @04-backend
**関連ADR:** ADR-001（システム全体）, ADR-007（S3アップロード）, ADR-008（動画保持）, ADR-019（HIPAA BAA）, ADR-023（AIデイリーコーチ）

---

## コンテキスト

PACE Platform Phase 6 にて、スタッフとアスリートがリモートで診療・相談を実施できる TeleHealth ビデオ通話機能を導入する。スポーツ医療プラットフォームとしての遠隔診療機能は、特に以下の法的・技術的要件を満たす必要がある。

1. **HIPAA 準拠**: ビデオセッション中の音声・映像は PHI として扱われる。既存の ADR-019 の BAA 設計に整合しなければならない
2. **WebRTC 基盤**: リアルタイム映像・音声の低遅延転送。STUN/TURN サーバーの管理コスト問題
3. **録画・保存**: セッション録画を求める組織向けのオプション録画機能と保持ポリシー
4. **モバイル対応**: Expo React Native クライアントからの参加
5. **法務コンプライアンス**: 遠隔診療に関する免責表示・機能制限設計

候補として Daily.co / Twilio Video / Amazon Chime / Agora.io の4サービスを比較検討した。

---

## 決定事項

### 1. WebRTC プロバイダー: Daily.co を採用

**比較マトリクス:**

| 評価項目 | Daily.co | Twilio Video | Amazon Chime | Agora.io |
|---------|----------|--------------|--------------|----------|
| HIPAA BAA | 提供（全プラン） | 提供（有料プランのみ） | 提供（AWS BAA） | **未提供** |
| E2E暗号化 | 標準搭載 | オプション（Beta） | なし | なし |
| Prebuilt UI SDK | React / RN 対応 | 廃止予定（2025/12） | 限定的 | あり |
| Expo React Native | 公式サポート | 未サポート | 未サポート | あり |
| SFU アーキテクチャ | あり | あり | あり | あり |
| 録画機能 | Cloud + Local | Cloud | なし | Cloud |
| 月次コスト（100ルーム/月） | ~$30 | ~$150 | ~$80 | ~$25 |
| 日本リージョン | あり | あり | あり | あり |

**Daily.co 採用理由:**
- **HIPAA BAA が全プランで提供**されており、ADR-019 のBAA対象サブプロセッサーリストに即時追加可能
- **Expo React Native 公式サポート**（`@daily-co/react-native-daily-js`）。Twilio は2025年12月にReact Native SDKを廃止済みで不適
- **E2E暗号化が標準搭載**。AES-128-GCM（メディア）+ DTLS 1.3（シグナリング）
- Agora は HIPAA BAA 未提供のため医療用途での採用不可

### 2. Daily.co HIPAA BAA 締結手順

ADR-019 のBAA対象サブプロセッサーリストに Daily.co を追加する。

```
締結手順:
1. Daily.co アカウントダッシュボード → Settings → HIPAA
2. "Request BAA" ボタンをクリック
3. 組織の法的担当者情報を入力
4. Daily.co 法務チームより BAA 文書が送付される（通常3〜5営業日）
5. DocuSign で電子署名
6. BAA 締結後、ダッシュボードに HIPAA モードが有効化される
```

**HIPAA モード有効化後の変更点:**
- ルーム録画はデフォルト無効（明示的オプトインが必要）
- ログデータから参加者情報が除外
- メディアサーバーが HIPAA 対象リージョン（米国・EU）に限定

### 3. システムアーキテクチャ

```
Staff Web App (Next.js)           Athlete Mobile App (Expo RN)
  |                                   |
  | @daily-co/daily-js                | @daily-co/react-native-daily-js
  |                                   |
  +------- Daily.co SFU Room ---------+
              |
              | Daily.co API
              v
  Next.js API Route (/api/telehealth/*)
              |
              | Supabase Client (service_role)
              v
  Supabase PostgreSQL
    telehealth_sessions テーブル
              |
              | セッション録画（オプション）
              v
  S3 pace-cv-sessions/telehealth/   ← PHI: 6年保持（ADR-008 ルール継承）
```

**シーケンス図（ルーム作成から接続まで）:**

```
Staff                    API Route                  Daily.co API           Supabase
  |                          |                           |                     |
  |-- POST /api/telehealth/rooms -->                    |                     |
  |                          |-- POST /v1/rooms -------->|                     |
  |                          |<-- { url, name, token } --|                     |
  |                          |-- INSERT telehealth_sessions ------------------>|
  |<-- { roomUrl, token } ---|                           |                     |
  |                          |                           |                     |
  |== Daily.co WebRTC ========================================                 |
  |                          |                           |                     |
Athlete                      |                           |                     |
  |-- GET /api/telehealth/rooms/{id}/token -->           |                     |
  |                          |-- (RLS で org/athlete 確認)                    |
  |                          |-- POST /v1/meeting-tokens -->|                  |
  |<-- { token } ------------|                           |                     |
  |== Daily.co WebRTC ========================================                 |
```

### 4. API 設計

**エンドポイント一覧:**

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| POST | `/api/telehealth/rooms` | staff JWT | Daily.co ルーム作成・セッション記録 |
| GET | `/api/telehealth/rooms/:id` | staff/athlete JWT | セッション詳細取得 |
| POST | `/api/telehealth/rooms/:id/token` | athlete JWT | アスリート用参加トークン発行 |
| PATCH | `/api/telehealth/rooms/:id/end` | staff JWT | セッション終了・録画保存 |
| GET | `/api/telehealth/sessions` | staff JWT | セッション一覧（組織内） |

**ルーム作成リクエスト/レスポンス:**

```typescript
// POST /api/telehealth/rooms
// Request
interface CreateRoomRequest {
  athlete_id: string;
  scheduled_at: string; // ISO 8601
  duration_minutes: number; // 最大 60
  enable_recording: boolean; // デフォルト false
  consent_obtained: boolean; // 必須: true でなければ作成不可
}

// Response
interface CreateRoomResponse {
  session_id: string;
  daily_room_url: string;
  staff_token: string;
  expires_at: string;
}
```

**参加トークン発行（アスリート向け）:**

```typescript
// POST /api/telehealth/rooms/:id/token
// Request
interface GetAthleteTokenRequest {
  athlete_id: string;
}

// Response
interface AthleteTokenResponse {
  token: string;
  daily_room_url: string;
  expires_at: string;
}
```

### 5. セキュリティ設計

#### 5-1. Daily.co ルーム設定

```typescript
// Daily.co ルーム作成時のセキュリティパラメータ
const roomConfig = {
  privacy: 'private',           // トークンなしでは入室不可
  properties: {
    exp: Math.floor(Date.now() / 1000) + 3600,  // 1時間で期限切れ
    max_participants: 2,         // スタッフ + アスリートの2名のみ
    enable_knocking: true,       // 入室前に承認が必要
    enable_chat: false,          // チャット無効（PHI漏洩防止）
    enable_screenshare: false,   // 画面共有無効
    enable_recording: false,     // デフォルト録画無効
    geo: 'us',                   // HIPAA 対象リージョン
    // E2E暗号化（HIPAA モード有効時は自動）
  },
};
```

#### 5-2. 参加トークンの権限分離

```typescript
// スタッフトークン
const staffTokenParams = {
  room_name: roomName,
  user_name: `staff:${staffId}`,
  is_owner: true,             // ミュート/キック権限あり
  start_video_off: false,
  start_audio_off: false,
  exp: roomExpiry,
};

// アスリートトークン
const athleteTokenParams = {
  room_name: roomName,
  user_name: `athlete:${athleteId}`,
  is_owner: false,            // 管理権限なし
  start_video_off: true,      // 初期状態はカメラオフ（プライバシー配慮）
  start_audio_off: true,
  exp: roomExpiry,
};
```

#### 5-3. Webhook による監査ログ

```typescript
// Daily.co Webhook → /api/telehealth/webhook
// meeting-participant-joined / meeting-participant-left / recording-started / recording-ready
// を受信して audit_log に記録（ADR-019 の監査設計継承）

interface DailyWebhookPayload {
  action: 'meeting-participant-joined' | 'meeting-participant-left' |
          'recording-started' | 'recording-ready' | 'meeting-ended';
  event_ts: number;
  payload: {
    room: string;
    session_id: string;
    participant?: { user_name: string; };
    recording?: { id: string; status: string; };
  };
}
```

### 6. 録画保存フロー

録画は組織が明示的にオプトインした場合のみ有効。

```
Daily.co Cloud Recording
    |
    | recording-ready Webhook
    v
POST /api/telehealth/webhook
    |
    | recording.download_link を取得
    v
S3 pace-cv-sessions/telehealth/{session_id}.mp4
    |
    | PHI として6年保持（ADR-008 継承）
    | SSE-S3（AES-256）暗号化
    v
telehealth_sessions.recording_s3_key 更新
```

---

## 法務審査フレームワーク: 遠隔診療免責表示・機能制限設計

### 7. ユーザー向け免責表示（必須表示）

セッション開始前に以下の免責事項を表示し、アスリート・スタッフの両者が明示的に同意した場合のみルームへの参加を許可する。

#### スタッフ向け免責事項（ja）

```
【遠隔診療に関する重要事項】

本機能は、対面診療の補助ツールとして提供されています。

■ 本機能でできること
・軽微な状態変化の確認・相談
・リハビリ進捗のビジュアル確認
・スタッフへの報告・連絡

■ 本機能でできないこと（禁止事項）
・新たな傷病の診断
・薬剤の処方・投薬指示
・緊急処置を要する症状への対応

■ 緊急時の対応
アスリートが以下の症状を訴えた場合は、直ちにビデオ通話を終了し、
救急サービス（119番）への連絡を指示してください。
・意識消失・痙攣
・激しい胸痛・呼吸困難
・大量出血

本機能を利用することで、上記の制限事項を理解した上で適切に使用することに同意したものとみなします。

[同意して開始する]  [キャンセル]
```

#### アスリート向け免責事項（ja）

```
【ビデオ相談に関するご説明】

このビデオ通話は、担当スタッフとのリモート相談ツールです。

・通話は暗号化されており、第三者には聞こえません
・緊急の場合は、通話を終了して119番に電話してください
・通話内容は、お客様の同意がある場合のみ録画されます

[同意して参加する]  [キャンセル]
```

### 8. 機能制限設計

AIコーチ（ADR-023）との連携において、ビデオセッション中の音声テキスト化データを Gemini API に送信することは**禁止**とする。

```typescript
// 禁止パターン（実装してはならない）
// ❌ const transcript = await transcribeSession(sessionRecording);
// ❌ const diagnosis = await gemini.generate(transcript);

// 許可パターン
// ✅ セッション後のスタッフによる手動メモ入力 → SOAP Note
// ✅ スタッフが明示的に入力したテキストの AI サジェスト補完
```

**実装レベルの制限フラグ:**

```typescript
export const TELEHEALTH_CONSTRAINTS = {
  // AI による自動診断生成の禁止
  AI_AUTO_DIAGNOSIS: false,

  // 録画の自動文字起こしの禁止
  AUTO_TRANSCRIPTION: false,

  // セッション映像のリアルタイム AI 解析の禁止（CV パイプライン連携禁止）
  REALTIME_CV_ANALYSIS: false,

  // 最大セッション時間（分）
  MAX_SESSION_DURATION_MINUTES: 60,

  // 1日あたりの最大セッション数（コスト保護 + 防壁3）
  MAX_SESSIONS_PER_DAY_PER_STAFF: 20,
} as const;
```

### 9. 各国・地域の遠隔診療規制への対応方針

| 地域 | 規制 | 対応方針 |
|------|------|---------|
| 日本 | 厚生労働省「オンライン診療の適切な実施に関する指針」 | スタッフが医師・医療資格者でない場合は「医療行為」と誤解される表現を排除。「相談」「確認」表記に統一 |
| 米国 | Ryan Haight Act・各州のテレヘルス規制 | 処方・診断は行わない設計で対応。各州の免許要件はユーザー組織の責任とし利用規約に明記 |
| EU | MDR（医療機器規制）・GDPR | ビデオデータはGDPR対象。録画オプション使用時は明示的同意取得を必須化 |

---

## 却下した選択肢

### A. Twilio Video

**却下理由:**
- React Native SDK が2025年12月に廃止。Expo クライアントへの対応が不可
- HIPAA BAA は有料プランのみ（コスト加算）
- E2E暗号化がベータステータスで本番使用不可

### B. Amazon Chime SDK

**却下理由:**
- 録画機能が未提供。セッション記録要件を満たせない
- React Native SDK のメンテナンスが不活発
- Prebuilt UI が提供されておらず、UI 実装コストが高い

### C. Agora.io

**却下理由:**
- **HIPAA BAA を提供していない**。医療・スポーツ医療プラットフォームとして採用不可（絶対的不採用要件）
- コストは最安だが法的リスクが許容できない

---

## コスト試算

Daily.co の料金体系（2026年3月時点）:

| 規模 | 月次セッション数 | 推定コスト |
|------|----------------|-----------|
| 小規模（〜50チーム） | 〜500セッション/月 | ~$30/月 |
| 中規模（〜200チーム） | 〜2,000セッション/月 | ~$120/月 |
| 大規模（エンタープライズ） | 〜10,000セッション/月 | 要見積もり |

コスト保護（防壁3）として、`MAX_SESSIONS_PER_DAY_PER_STAFF: 20` の制限を実装し、予期せぬ大量セッションを防止する。

---

## 影響範囲

- `supabase/migrations/20260324_phase6_telehealth.sql`: telehealth_sessions テーブル追加
- `supabase/functions/telehealth-webhook/`: Daily.co Webhook 受信 Edge Function
- `src/app/api/telehealth/`: Next.js API Routes 新規実装
- `src/components/telehealth/`: Daily.co React SDK 統合コンポーネント
- `apps/mobile/src/screens/Telehealth/`: Expo React Native 画面実装
- `.env.example`: `DAILY_API_KEY` 追加
- ADR-019 BAA 対象サブプロセッサーリストへの Daily.co 追加

---

## 参照

- [Daily.co HIPAA Compliance](https://www.daily.co/blog/hipaa/)
- [Daily.co React Native SDK](https://docs.daily.co/reference/rn-daily-js)
- [厚生労働省: オンライン診療の適切な実施に関する指針（2022年1月改訂）](https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/rinsyo/index_00010.html)
- [ADR-019: HIPAA対応・BAA締結・データフロー監査設計](./ADR-019-hipaa-compliance-baa.md)
- [ADR-008: 動画保持ポリシー](./ADR-008-video-retention-policy.md)
