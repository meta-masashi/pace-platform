/**
 * tests/setup.ts
 * ============================================================
 * Vitest グローバルセットアップ
 *
 * - Stripe モック（vi.mock）
 * - Supabase モック
 * - Gemini API モック
 * - 環境変数の初期化
 * ============================================================
 */

import { vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// 環境変数のデフォルト値設定
// ---------------------------------------------------------------------------

process.env.NODE_ENV = 'test'
process.env.STRIPE_SECRET_KEY ??= 'sk_test_mock_key_for_testing'
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_test_mock_secret'
process.env.STRIPE_STARTER_PRICE_ID ??= 'price_starter_test'
process.env.STRIPE_PRO_PRICE_ID ??= 'price_pro_test'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test-project.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.GEMINI_API_KEY ??= 'AIza_test_mock_key'
process.env.HACHI_SLACK_WEBHOOK_URL ??= ''  // テストでは Slack 通知を無効化

// ---------------------------------------------------------------------------
// グローバルモック: Stripe SDK
// ---------------------------------------------------------------------------

vi.mock('stripe', () => {
  const mockWebhooks = {
    constructEvent: vi.fn(),
    generateTestHeaderString: vi.fn().mockReturnValue('t=123,v1=mock-signature'),
  }

  const mockSubscriptions = {
    retrieve: vi.fn().mockResolvedValue({
      id: 'sub_test123',
      customer: 'cus_test123',
      status: 'active',
      items: {
        data: [{
          price: { id: 'price_pro_test' },
        }],
      },
      current_period_start: Math.floor(Date.now() / 1000) - 86400,
      current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
      cancel_at_period_end: false,
      trial_end: null,
    }),
    update: vi.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' }),
    list: vi.fn().mockResolvedValue({ data: [] }),
  }

  const mockCheckoutSessions = {
    create: vi.fn().mockResolvedValue({
      id: 'cs_test123',
      url: 'https://checkout.stripe.com/test',
      status: 'open',
    }),
    retrieve: vi.fn().mockResolvedValue({
      id: 'cs_test123',
      status: 'complete',
    }),
  }

  const mockBillingPortalSessions = {
    create: vi.fn().mockResolvedValue({
      id: 'bps_test123',
      url: 'https://billing.stripe.com/test',
    }),
  }

  const MockStripe = vi.fn().mockImplementation(() => ({
    webhooks: mockWebhooks,
    subscriptions: mockSubscriptions,
    checkout: { sessions: mockCheckoutSessions },
    billingPortal: { sessions: mockBillingPortalSessions },
  }))

  return { default: MockStripe }
})

// ---------------------------------------------------------------------------
// グローバルモック: Supabase
// ---------------------------------------------------------------------------

vi.mock('@supabase/supabase-js', () => {
  // 汎用チェーン可能なモックファクトリ
  function createChain(resolvedValue: unknown) {
    const chain: Record<string, unknown> = {}
    const terminal = vi.fn().mockResolvedValue(resolvedValue)
    const methods = ['select', 'insert', 'update', 'upsert', 'delete',
      'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'is', 'in', 'contains',
      'order', 'limit', 'range', 'match']

    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain)
    }
    chain['single'] = terminal
    chain['maybeSingle'] = terminal
    chain['then'] = terminal
    chain['count'] = terminal

    return chain
  }

  const mockSupabaseClient = {
    from: vi.fn().mockImplementation((_table: string) =>
      createChain({ data: null, error: null, count: 0 })
    ),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'user-test-123',
            email: 'test@pace-platform.test',
          },
        },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-test-123' }, session: { access_token: 'test-token' } },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test' } }),
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }

  return {
    createClient: vi.fn().mockReturnValue(mockSupabaseClient),
    SupabaseClient: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// グローバルモック: Gemini API (@google/generative-ai)
// ---------------------------------------------------------------------------

vi.mock('@google/generative-ai', () => {
  const mockGenerateContent = vi.fn().mockResolvedValue({
    response: {
      text: vi.fn().mockReturnValue(
        '膝関節の可動域制限については、有資格スタッフによる評価を推奨します。\n' +
        '※ この出力はAIによる補助情報です。最終的な判断・処置は必ず有資格スタッフが行ってください。'
      ),
      candidates: [{
        content: {
          parts: [{ text: '安全な補助情報のモック回答です。' }],
          role: 'model',
        },
        finishReason: 'STOP',
        safetyRatings: [],
      }],
    },
  })

  const mockModel = {
    generateContent: mockGenerateContent,
    generateContentStream: vi.fn().mockReturnValue({
      stream: (async function* () {
        yield { text: () => 'ストリーミング回答のモック' }
      })(),
      response: Promise.resolve({ text: () => 'ストリーミング完了' }),
    }),
    countTokens: vi.fn().mockResolvedValue({ totalTokens: 100 }),
  }

  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockReturnValue(mockModel),
    })),
    HarmCategory: {
      HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
      HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
      HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    },
    HarmBlockThreshold: {
      BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
      BLOCK_ONLY_HIGH: 'BLOCK_ONLY_HIGH',
    },
  }
})

// ---------------------------------------------------------------------------
// グローバルモック: fetch（外部 API 呼び出し）
// ---------------------------------------------------------------------------

const originalFetch = global.fetch

beforeEach(() => {
  // テスト間でモックをリセット
  vi.clearAllMocks()

  // fetch のデフォルトモック（外部 Slack/Webhook 呼び出しを無効化）
  global.fetch = vi.fn().mockImplementation(async (url: string) => {
    // Slack Webhook への呼び出しをサイレントに成功させる
    if (typeof url === 'string' && url.includes('hooks.slack.com')) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // その他の fetch は元の実装を使用
    return originalFetch(url)
  })
})

afterEach(() => {
  // fetch を元に戻す
  global.fetch = originalFetch
})

// ---------------------------------------------------------------------------
// テスト環境の検証
// ---------------------------------------------------------------------------

// テスト実行前に環境変数が正しく設定されていることを確認
if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
  console.warn(
    '[setup.ts] 警告: STRIPE_SECRET_KEY がテスト用キー (sk_test_...) ではありません。' +
    '本番キーを使用しないでください。'
  )
}
