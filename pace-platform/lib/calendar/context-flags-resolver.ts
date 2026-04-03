/**
 * PACE Platform — Calendar → contextFlags 自動連携
 *
 * Google Calendar イベントからコンテキストフラグ（isGameDay 等）を解決する。
 * 推論パイプラインの ContextFlags をカレンダーから自動設定し、
 * ハードコードされた false を置き換える。
 *
 * 安全設計:
 *   - カレンダー未接続時 → 全フラグ false（安全側）
 *   - 分類不明イベント → 'other'（-2% 影響、安全側）
 *   - MemoryCache 5分 TTL でカレンダー API コールを抑制
 */

import { listEvents, classifyEvent } from './google-client';
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('calendar');
import type { ClassifiedEvent } from './types';
import type { ContextFlags } from '@/lib/engine/v6/types';

// ---------------------------------------------------------------------------
// メモリキャッシュ（5分 TTL）
// ---------------------------------------------------------------------------

interface CacheEntry {
  flags: ContextFlags;
  cachedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5分
const cache = new Map<string, CacheEntry>();

function getCacheKey(teamId: string, date: string): string {
  return `${teamId}:${date}`;
}

// ---------------------------------------------------------------------------
// トークンリフレッシュ競合防止ロック
// ---------------------------------------------------------------------------

const refreshLocks = new Map<string, Promise<{ accessToken: string; expiryDate: number | null }>>();

// ---------------------------------------------------------------------------
// Supabase クライアント取得（遅延ロード）
// ---------------------------------------------------------------------------

async function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// メイン: contextFlags 解決
// ---------------------------------------------------------------------------

/**
 * チームのカレンダーからコンテキストフラグを解決する。
 *
 * @param teamId チーム ID
 * @param date   対象日（YYYY-MM-DD）
 * @returns 解決された ContextFlags
 */
export async function resolveContextFlags(
  teamId: string,
  date: string,
): Promise<ContextFlags> {
  // デフォルト値（安全側）
  const defaultFlags: ContextFlags = {
    isGameDay: false,
    isGameDayMinus1: false,
    isAcclimatization: false,
    isWeightMaking: false,
    isPostVaccination: false,
    isPostFever: false,
  };

  // キャッシュチェック
  const cacheKey = getCacheKey(teamId, date);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.flags;
  }

  try {
    const supabase = await getServiceClient();
    if (!supabase) return defaultFlags;

    // チームのカレンダー接続情報を取得
    const { data: connection } = await supabase
      .from('calendar_connections')
      .select('access_token, refresh_token, calendar_id, token_expires_at')
      .eq('team_id', teamId)
      .single();

    if (!connection?.access_token) {
      // カレンダー未接続 → デフォルト（安全側）
      cache.set(cacheKey, { flags: defaultFlags, cachedAt: Date.now() });
      return defaultFlags;
    }

    // トークン有効期限チェック＆リフレッシュ
    let accessToken = connection.access_token as string;
    const expiresAt = connection.token_expires_at as string | null;

    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      try {
        // 競合防止: 同一チームの並行リフレッシュを防止
        const lockKey = `refresh:${teamId}`;
        const existing = refreshLocks.get(lockKey);
        const refreshPromise = existing ?? (async () => {
          const { refreshAccessToken } = await import('./google-client');
          return refreshAccessToken(connection.refresh_token as string);
        })();

        if (!existing) {
          refreshLocks.set(lockKey, refreshPromise);
        }

        let refreshed: { accessToken: string; expiryDate: number | null };
        try {
          refreshed = await refreshPromise;
        } finally {
          refreshLocks.delete(lockKey);
        }

        // リフレッシュ結果の検証
        if (!refreshed.accessToken || refreshed.accessToken.trim() === '') {
          log.warn('リフレッシュトークンが空です');
          cache.set(cacheKey, { flags: defaultFlags, cachedAt: Date.now() });
          return defaultFlags;
        }

        accessToken = refreshed.accessToken;

        // トークンを更新
        await supabase
          .from('calendar_connections')
          .update({
            access_token: refreshed.accessToken,
            token_expires_at: refreshed.expiryDate
              ? new Date(refreshed.expiryDate).toISOString()
              : null,
          })
          .eq('team_id', teamId);
      } catch (err) {
        log.errorFromException('トークンリフレッシュ失敗', err);
        cache.set(cacheKey, { flags: defaultFlags, cachedAt: Date.now() });
        return defaultFlags;
      }
    }

    // 対象日と翌日のイベントを取得
    const targetDate = new Date(date);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const dayAfterNext = new Date(date);
    dayAfterNext.setDate(dayAfterNext.getDate() + 2);

    // 当日 + 翌日のイベントを取得（isGameDayMinus1 判定用）
    const events = await listEvents(
      accessToken,
      (connection.calendar_id as string) ?? 'primary',
      targetDate,
      dayAfterNext,
    );

    // イベント分類
    const classifiedEvents = events.map(classifyEvent);

    // contextFlags 解決
    const flags = resolveFromClassifiedEvents(classifiedEvents, date);

    // キャッシュ保存
    cache.set(cacheKey, { flags, cachedAt: Date.now() });

    return flags;
  } catch (err) {
    log.errorFromException('解決失敗（デフォルト使用）', err);
    cache.set(cacheKey, { flags: defaultFlags, cachedAt: Date.now() });
    return defaultFlags;
  }
}

// ---------------------------------------------------------------------------
// イベント分類 → ContextFlags 変換
// ---------------------------------------------------------------------------

function resolveFromClassifiedEvents(
  events: ClassifiedEvent[],
  targetDate: string,
): ContextFlags {
  const flags: ContextFlags = {
    isGameDay: false,
    isGameDayMinus1: false,
    isAcclimatization: false,
    isWeightMaking: false,
    isPostVaccination: false,
    isPostFever: false,
  };

  const targetDateStr = targetDate; // YYYY-MM-DD
  const nextDateStr = getNextDate(targetDate);

  for (const event of events) {
    const eventDate = event.startDateTime.split('T')[0] ?? '';

    if (event.eventType === 'match') {
      if (eventDate === targetDateStr) {
        flags.isGameDay = true;
      }
      if (eventDate === nextDateStr) {
        flags.isGameDayMinus1 = true;
      }
    }
  }

  return flags;
}

function getNextDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0] ?? '';
}

// ---------------------------------------------------------------------------
// キャッシュクリア（テスト用）
// ---------------------------------------------------------------------------

export function clearContextFlagsCache(): void {
  cache.clear();
}
