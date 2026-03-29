/**
 * tests/unit/plan-gates.test.ts
 * ============================================================
 * プラン別権限制御の単体テスト（防壁3）
 *
 * 対象: lib/billing/plan-gates.ts
 *   - canAccess()
 *   - requireAccess()
 *   - checkStaffLimit()
 *   - checkAthleteLimit()
 *   - getPlanDisplayName()
 * ============================================================
 */

import { describe, it, expect, vi, type MockedFunction } from 'vitest'
import {
  canAccess,
  requireAccess,
  checkStaffLimit,
  checkAthleteLimit,
  getPlanDisplayName,
  PLAN_FEATURES,
  PLAN_LIMITS,
  type Feature,
} from '../../lib/billing/plan-gates'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Supabase モッククライアントファクトリ
// ---------------------------------------------------------------------------

function createMockSupabase(subscriptionData: { plan: string; status: string } | null, error = false) {
  const mockSingle = vi.fn().mockResolvedValue({
    data: error ? null : subscriptionData,
    error: error ? { message: 'DB error' } : null,
  })

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: mockSingle,
          eq: vi.fn().mockReturnValue({
            single: mockSingle,
            count: 3, // スタッフ/選手数の mock
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

// スタッフ/選手数チェック用のモック
function createMockSupabaseWithCount(
  plan: string,
  staffCount: number,
  athleteCount?: number
) {
  let callCount = 0
  return {
    from: vi.fn().mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { plan }, error: null }),
          eq: vi.fn().mockReturnValue({
            // 2回目の eq チェーンで count を返す
            mockResolvedValue: undefined,
            then: undefined,
          }),
        }),
        count: vi.fn().mockResolvedValue({
          count: table === 'athletes' ? (athleteCount ?? staffCount) : staffCount,
          error: null,
        }),
      }),
    })),
  } as unknown as SupabaseClient
}

// ---------------------------------------------------------------------------
// PLAN_FEATURES 定義チェック
// ---------------------------------------------------------------------------

describe('PLAN_FEATURES', () => {
  it('standard プランは基本機能のみ含む', () => {
    expect(PLAN_FEATURES.standard).toContain('feature_basic_assessment')
    expect(PLAN_FEATURES.standard).toContain('feature_daily_checkin')
    expect(PLAN_FEATURES.standard).not.toContain('feature_gemini_ai')
    expect(PLAN_FEATURES.standard).not.toContain('feature_rag_pipeline')
  })

  it('pro プランは Gemini AI と RAG を含む', () => {
    expect(PLAN_FEATURES.pro).toContain('feature_gemini_ai')
    expect(PLAN_FEATURES.pro).toContain('feature_rag_pipeline')
    expect(PLAN_FEATURES.pro).not.toContain('feature_custom_bayes')
    expect(PLAN_FEATURES.pro).not.toContain('feature_enterprise')
  })

  it('enterprise プランは全機能を含む', () => {
    const allFeatures: Feature[] = [
      'feature_basic_assessment',
      'feature_daily_checkin',
      'feature_cv_analysis',
      'feature_rag_pipeline',
      'feature_gemini_ai',
      'feature_custom_bayes',
      'feature_enterprise',
      'feature_multi_team',
    ]
    for (const feature of allFeatures) {
      expect(PLAN_FEATURES.enterprise).toContain(feature)
    }
  })
})

// ---------------------------------------------------------------------------
// PLAN_LIMITS 定義チェック
// ---------------------------------------------------------------------------

describe('PLAN_LIMITS', () => {
  it('standard は maxStaff=5, maxAthletes=50', () => {
    expect(PLAN_LIMITS.standard.maxStaff).toBe(5)
    expect(PLAN_LIMITS.standard.maxAthletes).toBe(50)
  })

  it('pro は maxStaff=20, maxAthletes=200', () => {
    expect(PLAN_LIMITS.pro.maxStaff).toBe(20)
    expect(PLAN_LIMITS.pro.maxAthletes).toBe(200)
  })

  it('enterprise は上限なし（null）', () => {
    expect(PLAN_LIMITS.enterprise.maxStaff).toBeNull()
    expect(PLAN_LIMITS.enterprise.maxAthletes).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// canAccess
// ---------------------------------------------------------------------------

describe('canAccess', () => {
  it('active な pro プランで feature_gemini_ai にアクセスできる', async () => {
    const supabase = createMockSupabase({ plan: 'pro', status: 'active' })
    const result = await canAccess(supabase, 'org-1', 'feature_gemini_ai')
    expect(result.allowed).toBe(true)
    expect(result.plan).toBe('pro')
  })

  it('active な standard プランで feature_gemini_ai にアクセスできない', async () => {
    const supabase = createMockSupabase({ plan: 'standard', status: 'active' })
    const result = await canAccess(supabase, 'org-1', 'feature_gemini_ai')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Pro')
  })

  it('サブスクリプションが見つからない場合はアクセス拒否', async () => {
    const supabase = createMockSupabase(null, true)
    const result = await canAccess(supabase, 'org-1', 'feature_basic_assessment')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('サブスクリプション')
  })

  it('canceled 状態ではアクセス拒否', async () => {
    const supabase = createMockSupabase({ plan: 'pro', status: 'canceled' })
    const result = await canAccess(supabase, 'org-1', 'feature_gemini_ai')
    expect(result.allowed).toBe(false)
    expect(result.status).toBe('canceled')
  })

  it('past_due 状態では readOnly=true でアクセス拒否', async () => {
    const supabase = createMockSupabase({ plan: 'pro', status: 'past_due' })
    const result = await canAccess(supabase, 'org-1', 'feature_gemini_ai')
    expect(result.allowed).toBe(false)
    expect(result.readOnly).toBe(true)
    expect(result.reason).toContain('読み取り専用')
  })

  it('trialing 状態ではアクセス可能', async () => {
    const supabase = createMockSupabase({ plan: 'pro', status: 'trialing' })
    const result = await canAccess(supabase, 'org-1', 'feature_gemini_ai')
    expect(result.allowed).toBe(true)
  })

  it('standard プランで feature_custom_bayes は enterprise のみと案内する', async () => {
    const supabase = createMockSupabase({ plan: 'standard', status: 'active' })
    const result = await canAccess(supabase, 'org-1', 'feature_custom_bayes')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Enterprise')
  })
})

// ---------------------------------------------------------------------------
// requireAccess
// ---------------------------------------------------------------------------

describe('requireAccess', () => {
  it('アクセス許可の場合は例外をスローしない', async () => {
    const supabase = createMockSupabase({ plan: 'pro', status: 'active' })
    await expect(
      requireAccess(supabase, 'org-1', 'feature_gemini_ai')
    ).resolves.toBeUndefined()
  })

  it('アクセス拒否の場合は Error をスローする', async () => {
    const supabase = createMockSupabase({ plan: 'standard', status: 'active' })
    await expect(
      requireAccess(supabase, 'org-1', 'feature_gemini_ai')
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// getPlanDisplayName
// ---------------------------------------------------------------------------

describe('getPlanDisplayName', () => {
  it('standard の表示名に価格が含まれる', () => {
    const name = getPlanDisplayName('standard')
    expect(name).toContain('¥100,000')
    expect(name).toContain('Standard')
  })

  it('pro の表示名に価格が含まれる', () => {
    const name = getPlanDisplayName('pro')
    expect(name).toContain('¥300,000')
    expect(name).toContain('Pro')
  })

  it('enterprise の表示名に問合せ案内が含まれる', () => {
    const name = getPlanDisplayName('enterprise')
    expect(name).toContain('Enterprise')
    expect(name).toContain('問合せ')
  })
})
