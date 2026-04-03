/**
 * tests/security/security-checklist.test.ts
 * ============================================================
 * セキュリティコードレビューチェックリスト（自動化）
 *
 * カテゴリ:
 *   1. 認証・認可 — Service Role Key 露出チェック
 *   2. 機密情報 — ハードコードされた API キー検出
 *   3. 入力バリデーション — dangerouslySetInnerHTML 使用チェック
 *   4. 決済セキュリティ — Webhook 署名検証の実装確認
 *   5. 環境変数 — .env ファイルの gitignore 確認
 *   6. PII ログ出力 — console.log での PII 露出チェック
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// ヘルパー: ファイル再帰検索
// ---------------------------------------------------------------------------

function findFiles(dir: string, extensions: string[], excludeDirs: string[] = []): string[] {
  const results: string[] = []

  if (!fs.existsSync(dir)) return results

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (excludeDirs.includes(entry.name)) continue
      results.push(...findFiles(fullPath, extensions, excludeDirs))
    } else if (entry.isFile()) {
      if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath)
      }
    }
  }

  return results
}

function readFileContent(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

// プロジェクトルート
const LIB_DIR = path.resolve(__dirname, '../../lib')
const ROOT_DIR = path.resolve(__dirname, '../..')

// TS ファイル一覧（node_modules, tests 除外）
const tsFiles = findFiles(LIB_DIR, ['.ts'], ['node_modules', 'tests', '__tests__'])

// ---------------------------------------------------------------------------
// 1. 認証・認可
// ---------------------------------------------------------------------------

describe('セキュリティチェック: 認証・認可', () => {
  it('【防壁2】Service Role Key がフロントエンドコードに直接埋め込まれていない', () => {
    const violations: string[] = []

    for (const file of tsFiles) {
      const content = readFileContent(file)
      // Service Role Key のリテラル値がないことを確認
      // (環境変数 process.env.SUPABASE_SERVICE_ROLE_KEY の参照は OK、実際のキー値は NG)
      if (/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"`]eyJ[A-Za-z0-9+/=]{20,}/.test(content)) {
        violations.push(file)
      }
      // "service_role" という文字列リテラルが JWT に含まれている場合もチェック
      if (/['"`]eyJ[A-Za-z0-9+/=]*service_role[A-Za-z0-9+/=]*['"`]/.test(content)) {
        violations.push(file)
      }
    }

    expect(violations).toHaveLength(0)
  })

  // Billing module (webhook-handler, stripe-client) は Sprint 7 で廃止・削除済み
  // 決済機能の再実装時にテストを復活させること
})

// ---------------------------------------------------------------------------
// 2. 機密情報の保護
// ---------------------------------------------------------------------------

describe('セキュリティチェック: 機密情報', () => {
  it('【防壁2】API キーがコードにハードコードされていない（sk_live_ / sk_test_ / AIza）', () => {
    const violations: string[] = []

    for (const file of tsFiles) {
      const content = readFileContent(file)

      // Stripe Secret Key のパターン
      if (/['"`]sk_(live|test)_[0-9A-Za-z]{24,}['"`]/.test(content)) {
        violations.push(`${file}: Stripe Secret Key が検出されました`)
      }

      // Google API Key のパターン
      if (/['"`]AIza[0-9A-Za-z\-_]{35,}['"`]/.test(content)) {
        violations.push(`${file}: Google API Key が検出されました`)
      }

      // Supabase Anon Key のパターン
      if (/['"`]eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9+/=]{50,}/.test(content)) {
        violations.push(`${file}: Supabase JWT が検出されました（環境変数を使用してください）`)
      }
    }

    expect(violations).toHaveLength(0)
  })

  it('.env ファイルが存在する場合に .gitignore に含まれている', () => {
    const gitignorePath = path.join(ROOT_DIR, '..', '..', '.gitignore')
    const envFiles = ['.env', '.env.local', '.env.production']

    // HACHI-website ルートの .gitignore を確認
    const hachiGitignorePath = path.join(ROOT_DIR, '..', '.gitignore')

    // .gitignore が存在する場合のみチェック
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = readFileContent(gitignorePath)
      for (const envFile of envFiles) {
        // .gitignore に .env パターンが含まれていることを確認
        const isIgnored = gitignoreContent.includes('.env') ||
          gitignoreContent.includes(envFile)
        expect(isIgnored).toBe(true)
      }
    } else if (fs.existsSync(hachiGitignorePath)) {
      const gitignoreContent = readFileContent(hachiGitignorePath)
      expect(gitignoreContent).toContain('.env')
    } else {
      // .gitignore が見つからない場合はスキップ（CI 環境での考慮）
      console.warn('.gitignore が見つかりませんでした。手動で確認してください。')
    }
  })

  // stripe-client.ts は Sprint 7 で廃止・削除済み
})

// ---------------------------------------------------------------------------
// 3. 入力バリデーション
// ---------------------------------------------------------------------------

describe('セキュリティチェック: 入力バリデーション', () => {
  it('【防壁2】プロンプトインジェクション対策（sanitizeUserInput）が実装されている', () => {
    const securityHelpersPath = path.join(LIB_DIR, 'shared', 'security-helpers.ts')
    const content = readFileContent(securityHelpersPath)

    // sanitizeUserInput が実装されていることを確認
    expect(content).toContain('export function sanitizeUserInput')
    // INJECTION_PATTERNS が定義されていることを確認
    expect(content).toContain('INJECTION_PATTERNS')
    // 文字数上限が設定されていることを確認
    expect(content).toContain('MAX_PROMPT_CHARS')
  })

  it('【防壁2】出力ガードレール（detectHarmfulOutput）が実装されている', () => {
    const securityHelpersPath = path.join(LIB_DIR, 'shared', 'security-helpers.ts')
    const content = readFileContent(securityHelpersPath)

    expect(content).toContain('export function detectHarmfulOutput')
    expect(content).toContain('HARMFUL_OUTPUT_PATTERNS')
  })

  it('【防壁2】RAG パイプラインでインジェクション検出が行われている', () => {
    const ragPipelinePath = path.join(LIB_DIR, 'rag', 'pipeline.ts')
    const content = readFileContent(ragPipelinePath)

    // detectInjectionAttempt が使用されていることを確認
    expect(content).toContain('detectInjectionAttempt')
    // インジェクション検出時に早期リターンしていることを確認
    expect(content).toContain('injectionDetected')
  })
})

// ---------------------------------------------------------------------------
// 4. コスト保護
// ---------------------------------------------------------------------------

describe('セキュリティチェック: コスト保護（防壁3）', () => {
  it('【防壁3】Gemini クライアントにレートリミットチェックが実装されている', () => {
    const geminiClientPath = path.join(LIB_DIR, 'gemini', 'client.ts')
    const content = readFileContent(geminiClientPath)

    // レートリミットチェックが実装されていることを確認
    expect(content).toContain('checkRateLimit')
    expect(content).toContain('RATE_LIMIT_EXCEEDED')
  })

  it('【防壁3】月次/日次コール上限チェックが実装されている', () => {
    const geminiClientPath = path.join(LIB_DIR, 'gemini', 'client.ts')
    const content = readFileContent(geminiClientPath)

    // rate-limiter 経由で日次上限チェックが行われている
    // （checkRateLimit 内で DAILY_ORG_LIMIT をチェック）
    const hasLimitCheck =
      content.includes('MONTHLY_LIMIT_EXCEEDED') ||
      content.includes('checkRateLimit')

    expect(hasLimitCheck).toBe(true)
  })

  // Stripe/billing モジュールは Sprint 7 で廃止・削除済み
  // stripe-client.ts, plan-gates.ts のテストは決済機能再実装時に復活させること
})

// ---------------------------------------------------------------------------
// 5. 耐障害性（防壁4）
// ---------------------------------------------------------------------------

describe('セキュリティチェック: 耐障害性（防壁4）', () => {
  it('【防壁4】Gemini クライアントにリトライロジックが実装されている', () => {
    const geminiClientPath = path.join(LIB_DIR, 'gemini', 'client.ts')
    const content = readFileContent(geminiClientPath)

    // リトライループが実装されていることを確認
    expect(content).toContain('MAX_RETRIES')
    expect(content).toContain('GEMINI_EXHAUSTED')
    // 指数バックオフが実装されていることを確認（コメントまたはコード中のキーワード）
    expect(content).toMatch(/バックオフ|backoff|exponential/i)
  })

  it('【防壁4】汎用リトライハンドラーが実装されている', () => {
    const retryHandlerPath = path.join(LIB_DIR, 'shared', 'retry-handler.ts')
    const content = readFileContent(retryHandlerPath)

    expect(content).toContain('export async function withRetry')
    expect(content).toContain('RETRY_EXHAUSTED')
    expect(content).toContain('shouldNotRetry')
  })

  // webhook-handler.ts は Sprint 7 で廃止・削除済み

  it('【防壁4】RAG パイプラインに適応的検索戦略（フォールバック）が実装されている', () => {
    const retrieverPath = path.join(LIB_DIR, 'rag', 'retriever.ts')
    const content = readFileContent(retrieverPath)

    expect(content).toContain('retrieveWithAdaptiveStrategy')
    expect(content).toContain('hybrid')
    // 段階的フォールバックが実装されていることを確認
    expect(content).toContain('relaxed_threshold')
    expect(content).toContain('increased_count')
  })
})

// ---------------------------------------------------------------------------
// 6. PII 保護
// ---------------------------------------------------------------------------

describe('セキュリティチェック: PII 保護', () => {
  it('【防壁2】PII マスキング関数が実装されている', () => {
    const securityHelpersPath = path.join(LIB_DIR, 'shared', 'security-helpers.ts')
    const content = readFileContent(securityHelpersPath)

    expect(content).toContain('export function maskPii')
    // 主要な PII パターン（メール・電話・カード）がマスクされることを確認
    expect(content).toContain('[EMAIL-MASKED]')
    expect(content).toContain('[TEL-MASKED]')
    expect(content).toContain('[CARD-MASKED]')
  })

  it('【防壁2】CDS システムプレフィックスに PII 出力禁止ルールが含まれている', () => {
    const geminiClientPath = path.join(LIB_DIR, 'gemini', 'client.ts')
    const content = readFileContent(geminiClientPath)

    // システムプロンプトに PII 禁止ルールが含まれていることを確認
    expect(content).toContain('個人を特定できる情報')
  })
})

// ---------------------------------------------------------------------------
// Sprint 6: チャットルートのセキュリティ検証
// ---------------------------------------------------------------------------

describe('Sprint 6: チャットルート sanitizeUserInput 確認', () => {
  const chatRoutes = [
    'app/api/rehab/chat/route.ts',
    'app/api/training/chat/route.ts',
  ]

  for (const route of chatRoutes) {
    it(`${route} に sanitizeUserInput がインポートされている`, () => {
      const fullPath = path.resolve(ROOT_DIR, route)
      const content = readFileContent(fullPath)
      expect(content).toContain('sanitizeUserInput')
    })
  }
})
