# ADR-031: 保険請求パートナーAPI統合方式

**ステータス:** 採用（実装は Sprint 7 前半）  
**決定日:** 2026-03-24  
**決定者:** @05-architect + PM  

## コンテキスト

Phase 6 Sprint 7 で実装する保険請求・診療報酬連携の統合方式を確定する。

## 決定内容

### 請求コーディング方式

- **ICD-10-CM**: 傷病コードは `assessment.primary_diagnosis.diagnosis_code` を直接マッピング
- **診療報酬点数表**: 日本の療養担当規則に基づく処置コードは SOAP の `a_text` から Gemini 2.0 Flash で自動抽出し master テーブルと照合

### パートナーAPI接続

- Phase 6 内では **モックAPIエンドポイント**を実装し、本番パートナー接続は Phase 7 で差し替え
- 接続方式: REST + JWT（パートナー提供）
- 冪等性: `claim_reference_id`（UUID）をリクエストヘッダーに付与

### データモデル

```
billing_claims       -- 請求レコード（draft → submitted → paid/rejected）
billing_codes        -- ICD-10-CM + 診療報酬コードマスター
```

### アクセス制御

- 請求UIは `master` ロールのみ
- 請求データの閲覧・操作は RLS で `org_id` スコープに限定

## リスク

- 実際の診療報酬コードの精度はLLM出力に依存するため、最終確認は必ずスタッフが実施
- パートナーAPI 未契約時は draft 状態で保留し、送信ボタンを非活性化
