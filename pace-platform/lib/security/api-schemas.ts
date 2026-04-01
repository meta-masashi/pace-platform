/**
 * PACE Platform — API リクエストバリデーションスキーマ（Zod）
 *
 * 全 API ルートで共通的に使用するバリデーションスキーマ定義。
 * 個々のルートでは parseBody() ヘルパーを使ってバリデーションを行う。
 */

import { z } from 'zod'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// 共通プリミティブ
// ---------------------------------------------------------------------------

/** UUID v4 形式バリデーション */
export const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'UUID 形式が不正です',
  )

/** ISO 8601 日付文字列（YYYY-MM-DD） */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, '日付は YYYY-MM-DD 形式で入力してください')

/** メールアドレス */
export const emailSchema = z.string().email('メールアドレスの形式が不正です').max(254)

/** サニタイズ済み文字列（制御文字除去） */
export const safeStringSchema = (maxLength = 1000) =>
  z
    .string()
    .max(maxLength)
    .transform((s) => s.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''))

// ---------------------------------------------------------------------------
// admin/staff スキーマ
// ---------------------------------------------------------------------------

export const staffInviteSchema = z.object({
  email: emailSchema,
  role: z.enum(['master', 'AT', 'PT', 'S&C'], {
    errorMap: () => ({ message: 'role は master, AT, PT, S&C のいずれかを指定してください。' }),
  }),
  name: safeStringSchema(100).optional(),
})

export const staffUpdateSchema = z.object({
  staffId: uuidSchema,
  role: z.enum(['master', 'AT', 'PT', 'S&C']).optional(),
  is_leader: z.boolean().optional(),
  is_active: z.boolean().optional(),
  team_id: uuidSchema.nullable().optional(),
})

// ---------------------------------------------------------------------------
// admin/teams スキーマ
// ---------------------------------------------------------------------------

export const teamCreateSchema = z.object({
  name: safeStringSchema(100),
  sport: safeStringSchema(50).optional(),
})

export const teamUpdateSchema = z.object({
  teamId: uuidSchema,
  name: safeStringSchema(100).optional(),
  sport: safeStringSchema(50).optional(),
  is_active: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// checkin スキーマ
// ---------------------------------------------------------------------------

export const checkinSchema = z.object({
  athlete_id: uuidSchema,
  date: dateStringSchema,
  sleep_quality: z.number().int().min(1).max(10).optional(),
  fatigue: z.number().int().min(1).max(10).optional(),
  stress: z.number().int().min(1).max(10).optional(),
  soreness: z.number().int().min(1).max(10).optional(),
  mood: z.number().int().min(1).max(10).optional(),
  pain_nrs: z.number().int().min(0).max(10).optional(),
  pain_location: safeStringSchema(200).optional(),
  notes: safeStringSchema(2000).optional(),
})

// ---------------------------------------------------------------------------
// community/messages スキーマ
// ---------------------------------------------------------------------------

export const messageCreateSchema = z.object({
  channelId: uuidSchema,
  content: safeStringSchema(5000),
  parentId: uuidSchema.optional(),
})

// ---------------------------------------------------------------------------
// ヘルパー: parseBody — JSON パース + Zod バリデーション
// ---------------------------------------------------------------------------

/**
 * リクエストボディを JSON パースし、Zod スキーマでバリデーションする。
 *
 * @param request リクエストオブジェクト
 * @param schema  Zod スキーマ
 * @returns バリデーション成功時は data、失敗時は NextResponse（400）
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return {
      error: NextResponse.json(
        { success: false, error: 'リクエストボディの JSON パースに失敗しました。' },
        { status: 400 },
      ),
    }
  }

  const result = schema.safeParse(raw)

  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join('; ')
    return {
      error: NextResponse.json(
        { success: false, error: `入力値が不正です: ${messages}` },
        { status: 400 },
      ),
    }
  }

  return { data: result.data }
}
