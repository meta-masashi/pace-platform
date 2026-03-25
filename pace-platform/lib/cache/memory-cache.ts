/**
 * PACE Platform — インメモリ LRU キャッシュ
 *
 * API ルートのホットデータ（チームダッシュボード、コンディショニングスコア、
 * カレンダーイベント等）を短期間キャッシュし、DB 負荷を軽減する。
 *
 * 特徴:
 * - TTL ベースの有効期限管理
 * - 最大エントリ数制限と LRU（Least Recently Used）追い出し
 * - シングルスレッド Node.js で安全に動作
 */

import type { CacheEntry, CacheConfig } from './types';

// ---------------------------------------------------------------------------
// MemoryCache クラス
// ---------------------------------------------------------------------------

export class MemoryCache<T> {
  private readonly entries: Map<string, CacheEntry<T>>;
  private readonly config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      defaultTTL: config.defaultTTL ?? 60,
      maxEntries: config.maxEntries ?? 100,
    };
    this.entries = new Map();
  }

  /**
   * キャッシュからデータを取得する。
   *
   * - 有効期限切れのエントリは自動削除して undefined を返す
   * - 取得時にエントリを Map の末尾に移動（LRU 順序更新）
   *
   * @param key キャッシュキー
   * @returns キャッシュされたデータ、または undefined
   */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    // 有効期限チェック
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    // LRU 順序更新: 削除→再挿入で Map の末尾に移動
    this.entries.delete(key);
    this.entries.set(key, entry);

    return entry.data;
  }

  /**
   * キャッシュにデータを保存する。
   *
   * - maxEntries を超える場合、最も古い（先頭の）エントリを削除
   * - 既存キーの場合は上書き
   *
   * @param key キャッシュキー
   * @param data 保存するデータ
   * @param ttl TTL（秒）。省略時はデフォルト TTL を使用
   */
  set(key: string, data: T, ttl?: number): void {
    // 既存エントリがあれば削除（LRU 順序リセット）
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    // maxEntries 超過時に LRU（先頭）エントリを削除
    while (this.entries.size >= this.config.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      } else {
        break;
      }
    }

    const effectiveTTL = ttl ?? this.config.defaultTTL;
    const entry: CacheEntry<T> = {
      key,
      data,
      expiresAt: Date.now() + effectiveTTL * 1000,
    };

    this.entries.set(key, entry);
  }

  /**
   * 指定キーのキャッシュエントリを削除する。
   *
   * @param key キャッシュキー
   * @returns 削除された場合 true
   */
  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  /**
   * すべてのキャッシュエントリを削除する。
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * 現在のキャッシュエントリ数を返す（期限切れエントリを含む）。
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * キャッシュにキーが存在し、かつ有効期限内であるかを確認する。
   *
   * @param key キャッシュキー
   * @returns 有効なエントリが存在する場合 true
   */
  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }
}
