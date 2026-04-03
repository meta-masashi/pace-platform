/**
 * PACE Platform — Web Push サブスクリプション管理 API
 *
 * POST   /api/notifications/push-subscription — 購読登録
 * DELETE /api/notifications/push-subscription — 購読解除
 */

import { createClient } from '@/lib/supabase/server';
import { withApiHandler, ApiError } from '@/lib/api/handler';

export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。');
  }

  const body = await req.json();
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    throw new ApiError(400, '不正なサブスクリプションデータです。');
  }

  // スタッフ情報取得
  const { data: staff } = await supabase
    .from('staff')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!staff) {
    throw new ApiError(403, 'スタッフ情報が見つかりません。');
  }

  // notification_preferences に web_push サブスクリプションを upsert
  const { error: upsertError } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        staff_id: user.id,
        org_id: staff.org_id as string,
        channel: 'web_push',
        enabled: true,
        config: {
          subscription: {
            endpoint: body.endpoint,
            keys: {
              p256dh: body.keys.p256dh,
              auth: body.keys.auth,
            },
          },
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'staff_id,channel' },
    );

  if (upsertError) {
    ctx.log.error('Push subscription 保存エラー', { detail: upsertError });
    throw new ApiError(500, 'サブスクリプションの保存に失敗しました。');
  }

  return { subscribed: true };
}, { service: 'notifications' });

export const DELETE = withApiHandler(async (_req, ctx) => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。');
  }

  const { error } = await supabase
    .from('notification_preferences')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('staff_id', user.id)
    .eq('channel', 'web_push');

  if (error) {
    ctx.log.error('Push subscription 削除エラー', { detail: error });
    throw new ApiError(500, 'サブスクリプションの解除に失敗しました。');
  }

  return { subscribed: false };
}, { service: 'notifications' });
