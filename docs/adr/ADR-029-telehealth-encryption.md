# ADR-029: TeleHealth 通信暗号化方式

**ステータス:** 採用  
**決定日:** 2026-03-24  
**決定者:** @05-architect  

## コンテキスト

Phase 6 Sprint 1〜5 で実装した TeleHealth 機能（Daily.co WebRTC）の通信暗号化方式を確定し記録する。

## 決定内容

| レイヤー | 採用技術 | 根拠 |
|---------|---------|------|
| シグナリング | HTTPS/TLS 1.3 | Daily.co API サーバー経由 |
| メディア暗号化 | DTLS-SRTP (WebRTC 標準) | E2E 暗号化、Daily.co 全プランで有効 |
| 録画 | 禁止（`enable_recording: off`） | ADR-027 法務制約 |
| トークン | Daily.co meeting token（HMAC-SHA256 署名） | 参加者本人確認 + セッション紐付け |

## 結果

- HIPAA BAA 要件を Daily.co の DTLS-SRTP 実装で充足
- 録画禁止により映像データの二次漏洩リスクをゼロ化
- `telehealth_audit_log` で参加者・接続時刻を不変ログとして記録
