/**
 * tests/unit/cache.test.ts
 * ============================================================
 * MemoryCache ユニットテスト
 *
 * テスト対象:
 *   - TTL 内の set/get
 *   - TTL 超過後の自動削除
 *   - maxEntries 超過時の LRU 追い出し
 *   - clear による全エントリ削除
 *   - has / delete / size
 * ============================================================
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryCache } from '@/lib/cache/memory-cache';

describe('MemoryCache', () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache<string>({ defaultTTL: 10, maxEntries: 5 });
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // set/get — TTL 内
  // -----------------------------------------------------------------------

  describe('set/get within TTL', () => {
    it('should store and retrieve a value', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should overwrite an existing value', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'updated');
      expect(cache.get('key1')).toBe('updated');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should store multiple entries', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      expect(cache.get('a')).toBe('1');
      expect(cache.get('b')).toBe('2');
      expect(cache.get('c')).toBe('3');
      expect(cache.size).toBe(3);
    });

    it('should support custom TTL per entry', () => {
      cache.set('short', 'data', 1);
      cache.set('long', 'data', 3600);

      expect(cache.get('short')).toBe('data');
      expect(cache.get('long')).toBe('data');
    });
  });

  // -----------------------------------------------------------------------
  // TTL 超過後の自動削除
  // -----------------------------------------------------------------------

  describe('expiration after TTL', () => {
    it('should return undefined for expired entries on get', () => {
      vi.useFakeTimers();

      cache.set('key1', 'value1', 5); // 5秒 TTL
      expect(cache.get('key1')).toBe('value1');

      // 6秒後
      vi.advanceTimersByTime(6_000);
      expect(cache.get('key1')).toBeUndefined();

      vi.useRealTimers();
    });

    it('should remove expired entries from the cache on get', () => {
      vi.useFakeTimers();

      cache.set('key1', 'value1', 2);
      expect(cache.size).toBe(1);

      vi.advanceTimersByTime(3_000);
      cache.get('key1'); // triggers cleanup
      expect(cache.size).toBe(0);

      vi.useRealTimers();
    });

    it('should report has() as false for expired entries', () => {
      vi.useFakeTimers();

      cache.set('key1', 'value1', 1);
      expect(cache.has('key1')).toBe(true);

      vi.advanceTimersByTime(2_000);
      expect(cache.has('key1')).toBe(false);

      vi.useRealTimers();
    });

    it('should not expire entries before TTL', () => {
      vi.useFakeTimers();

      cache.set('key1', 'value1', 10);

      vi.advanceTimersByTime(9_000);
      expect(cache.get('key1')).toBe('value1');

      vi.useRealTimers();
    });
  });

  // -----------------------------------------------------------------------
  // LRU 追い出し
  // -----------------------------------------------------------------------

  describe('LRU eviction at max entries', () => {
    it('should evict the oldest entry when maxEntries is exceeded', () => {
      // maxEntries = 5
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      cache.set('d', '4');
      cache.set('e', '5');

      expect(cache.size).toBe(5);

      // 6th entry should evict 'a' (oldest)
      cache.set('f', '6');
      expect(cache.size).toBe(5);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('f')).toBe('6');
    });

    it('should update LRU order on get', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      cache.set('d', '4');
      cache.set('e', '5');

      // Access 'a' to move it to most-recently-used
      cache.get('a');

      // Adding a new entry should evict 'b' (now the oldest)
      cache.set('f', '6');
      expect(cache.get('a')).toBe('1'); // 'a' should still exist
      expect(cache.get('b')).toBeUndefined(); // 'b' evicted
    });

    it('should update LRU order on set (overwrite)', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      cache.set('d', '4');
      cache.set('e', '5');

      // Overwrite 'a' to move it to most-recently-used
      cache.set('a', 'updated');

      // Adding a new entry should evict 'b'
      cache.set('f', '6');
      expect(cache.get('a')).toBe('updated');
      expect(cache.get('b')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // clear
  // -----------------------------------------------------------------------

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      expect(cache.size).toBe(3);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  describe('delete', () => {
    it('should delete a specific entry and return true', () => {
      cache.set('key1', 'value1');
      const result = cache.delete('key1');
      expect(result).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it('should return false for non-existent keys', () => {
      const result = cache.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // has
  // -----------------------------------------------------------------------

  describe('has', () => {
    it('should return true for existing valid entries', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for non-existent entries', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // typed cache
  // -----------------------------------------------------------------------

  describe('typed cache', () => {
    it('should work with complex object types', () => {
      interface DashboardData {
        kpi: { score: number };
        alerts: string[];
      }

      const objCache = new MemoryCache<DashboardData>({ defaultTTL: 60 });
      const data: DashboardData = {
        kpi: { score: 85 },
        alerts: ['alert1', 'alert2'],
      };

      objCache.set('dashboard:team1', data);
      const retrieved = objCache.get('dashboard:team1');

      expect(retrieved).toEqual(data);
      expect(retrieved?.kpi.score).toBe(85);
      expect(retrieved?.alerts).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // default config
  // -----------------------------------------------------------------------

  describe('default config', () => {
    it('should use default TTL of 60 seconds and maxEntries of 100', () => {
      vi.useFakeTimers();

      const defaultCache = new MemoryCache<string>();
      defaultCache.set('key', 'value');

      // Still available at 59 seconds
      vi.advanceTimersByTime(59_000);
      expect(defaultCache.get('key')).toBe('value');

      // Expired at 61 seconds
      vi.advanceTimersByTime(2_000);
      expect(defaultCache.get('key')).toBeUndefined();

      vi.useRealTimers();
    });
  });
});
