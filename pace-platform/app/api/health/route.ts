/**
 * PACE Platform — ヘルスチェック API
 *
 * GET /api/health
 *
 * アプリケーションの稼働状態を返す。
 * Supabase 接続チェックを行い、結果を checks に含める。
 * Supabase が落ちていても 200 を返す（checks.supabase = 'error'）。
 *
 * NOTE: このルートは認証不要。middleware の API_AUTH_EXEMPT リストに
 *       '/api/health' を追加すること（別途対応）。
 */

import { createClient } from '@/lib/supabase/server';
import { withApiHandler } from '@/lib/api/handler';

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (_req, { log }) => {
  let supabaseStatus: 'ok' | 'error' = 'ok';

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('', undefined).maybeSingle();

    // rpc('') may not exist — fall back to a simple query
    if (error) {
      const { error: pingError } = await supabase
        .from('_health_ping')
        .select('1')
        .limit(1)
        .maybeSingle();

      // If the table doesn't exist that's fine — we just need the connection to succeed.
      // A network-level / auth-level failure will throw or return a non-PGRST error.
      if (pingError && !pingError.code?.startsWith('PGRST')) {
        throw pingError;
      }
    }
  } catch (err) {
    log.warn('Supabase health check failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    supabaseStatus = 'error';
  }

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION ?? 'dev',
    checks: {
      supabase: supabaseStatus,
    },
  };
}, { service: 'health' });
