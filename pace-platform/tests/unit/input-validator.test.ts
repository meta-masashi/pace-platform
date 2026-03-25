/**
 * tests/unit/input-validator.test.ts
 * ============================================================
 * 入力バリデーション ユニットテスト
 *
 * テスト対象:
 *   - validateUUID: UUID v4 形式の検証
 *   - validateEmail: メールアドレス形式の検証
 *   - validateDateString: ISO 8601 日付文字列の検証
 *   - sanitizeString: 文字列サニタイズ
 *   - validatePagination: ページネーションパラメータのクランプ
 * ============================================================
 */

import { describe, it, expect } from 'vitest';
import {
  validateUUID,
  validateEmail,
  validateDateString,
  sanitizeString,
  validatePagination,
} from '@/lib/security/input-validator';

// -------------------------------------------------------------------------
// validateUUID
// -------------------------------------------------------------------------

describe('validateUUID', () => {
  it('should accept valid UUID v4 strings', () => {
    expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(validateUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
    expect(validateUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
  });

  it('should accept UUID with uppercase letters', () => {
    expect(validateUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('should reject empty strings', () => {
    expect(validateUUID('')).toBe(false);
  });

  it('should reject non-UUID strings', () => {
    expect(validateUUID('not-a-uuid')).toBe(false);
    expect(validateUUID('12345')).toBe(false);
    expect(validateUUID('hello-world-this-is-not-valid')).toBe(false);
  });

  it('should reject UUIDs without hyphens', () => {
    expect(validateUUID('550e8400e29b41d4a716446655440000')).toBe(false);
  });

  it('should reject UUIDs with extra characters', () => {
    expect(validateUUID('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false);
    expect(validateUUID(' 550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('should reject SQL injection attempts', () => {
    expect(validateUUID("'; DROP TABLE users; --")).toBe(false);
    expect(validateUUID('1 OR 1=1')).toBe(false);
  });

  it('should reject path traversal attempts', () => {
    expect(validateUUID('../../../etc/passwd')).toBe(false);
  });
});

// -------------------------------------------------------------------------
// validateEmail
// -------------------------------------------------------------------------

describe('validateEmail', () => {
  it('should accept valid email addresses', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('test.user@domain.co.jp')).toBe(true);
    expect(validateEmail('user+tag@company.org')).toBe(true);
    expect(validateEmail('first.last@subdomain.example.com')).toBe(true);
  });

  it('should reject emails without @', () => {
    expect(validateEmail('userexample.com')).toBe(false);
  });

  it('should reject emails without domain', () => {
    expect(validateEmail('user@')).toBe(false);
  });

  it('should reject emails without local part', () => {
    expect(validateEmail('@example.com')).toBe(false);
  });

  it('should reject empty strings', () => {
    expect(validateEmail('')).toBe(false);
  });

  it('should reject emails exceeding 254 characters', () => {
    const longLocal = 'a'.repeat(250);
    expect(validateEmail(`${longLocal}@test.com`)).toBe(false);
  });

  it('should reject emails with spaces', () => {
    expect(validateEmail('user @example.com')).toBe(false);
  });
});

// -------------------------------------------------------------------------
// validateDateString
// -------------------------------------------------------------------------

describe('validateDateString', () => {
  it('should accept valid YYYY-MM-DD dates', () => {
    expect(validateDateString('2024-01-15')).toBe(true);
    expect(validateDateString('2024-12-31')).toBe(true);
    expect(validateDateString('2024-02-29')).toBe(true); // 2024 is leap year
    expect(validateDateString('2000-01-01')).toBe(true);
  });

  it('should reject invalid dates', () => {
    expect(validateDateString('2024-02-30')).toBe(false); // Feb 30 doesn't exist
    expect(validateDateString('2023-02-29')).toBe(false); // 2023 is not leap year
    expect(validateDateString('2024-13-01')).toBe(false); // Month 13
    expect(validateDateString('2024-00-15')).toBe(false); // Month 0
    expect(validateDateString('2024-06-31')).toBe(false); // June has 30 days
  });

  it('should reject invalid formats', () => {
    expect(validateDateString('01-15-2024')).toBe(false); // MM-DD-YYYY
    expect(validateDateString('2024/01/15')).toBe(false); // slashes
    expect(validateDateString('2024-1-15')).toBe(false);  // single digit month
    expect(validateDateString('2024-01-5')).toBe(false);  // single digit day
    expect(validateDateString('20240115')).toBe(false);   // no separators
  });

  it('should reject empty and non-date strings', () => {
    expect(validateDateString('')).toBe(false);
    expect(validateDateString('not-a-date')).toBe(false);
    expect(validateDateString('today')).toBe(false);
  });

  it('should reject dates with time components', () => {
    expect(validateDateString('2024-01-15T00:00:00Z')).toBe(false);
    expect(validateDateString('2024-01-15 10:30')).toBe(false);
  });
});

// -------------------------------------------------------------------------
// sanitizeString
// -------------------------------------------------------------------------

describe('sanitizeString', () => {
  it('should trim whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
    expect(sanitizeString('\thello\n')).toBe('hello');
  });

  it('should remove control characters', () => {
    expect(sanitizeString('hello\x00world')).toBe('helloworld');
    expect(sanitizeString('test\x01\x02\x03data')).toBe('testdata');
    expect(sanitizeString('abc\x0Bdef')).toBe('abcdef');
  });

  it('should preserve normal whitespace characters', () => {
    // \t (\x09), \n (\x0A), \r (\x0D) should be preserved
    expect(sanitizeString('line1\nline2')).toBe('line1\nline2');
    expect(sanitizeString('col1\tcol2')).toBe('col1\tcol2');
  });

  it('should limit string length to maxLength', () => {
    const longString = 'a'.repeat(2000);
    expect(sanitizeString(longString, 100)).toHaveLength(100);
  });

  it('should use default maxLength of 1000', () => {
    const longString = 'a'.repeat(2000);
    expect(sanitizeString(longString)).toHaveLength(1000);
  });

  it('should handle empty strings', () => {
    expect(sanitizeString('')).toBe('');
  });

  it('should handle Japanese text correctly', () => {
    expect(sanitizeString('膝関節の可動域制限')).toBe('膝関節の可動域制限');
  });

  it('should handle strings shorter than maxLength', () => {
    expect(sanitizeString('short', 1000)).toBe('short');
  });

  it('should remove null bytes from potentially malicious input', () => {
    expect(sanitizeString('valid\x00<script>alert(1)</script>')).toBe(
      'valid<script>alert(1)</script>'
    );
  });
});

// -------------------------------------------------------------------------
// validatePagination
// -------------------------------------------------------------------------

describe('validatePagination', () => {
  it('should use defaults when no params provided', () => {
    const result = validatePagination({});
    expect(result).toEqual({ limit: 20, offset: 0 });
  });

  it('should accept valid limit and offset', () => {
    const result = validatePagination({ limit: 50, offset: 100 });
    expect(result).toEqual({ limit: 50, offset: 100 });
  });

  it('should clamp limit to MAX_LIMIT (100)', () => {
    const result = validatePagination({ limit: 500 });
    expect(result.limit).toBe(100);
  });

  it('should clamp limit to MIN_LIMIT (1)', () => {
    const result = validatePagination({ limit: 0 });
    expect(result.limit).toBe(1);

    const negative = validatePagination({ limit: -10 });
    expect(negative.limit).toBe(1);
  });

  it('should clamp offset to MIN_OFFSET (0)', () => {
    const result = validatePagination({ offset: -5 });
    expect(result.offset).toBe(0);
  });

  it('should clamp offset to MAX_OFFSET (10000)', () => {
    const result = validatePagination({ offset: 50000 });
    expect(result.offset).toBe(10000);
  });

  it('should floor fractional values', () => {
    const result = validatePagination({ limit: 15.7, offset: 3.9 });
    expect(result.limit).toBe(15);
    expect(result.offset).toBe(3);
  });

  it('should handle NaN values by using defaults', () => {
    const result = validatePagination({ limit: NaN, offset: NaN });
    expect(result).toEqual({ limit: 20, offset: 0 });
  });

  it('should handle Infinity values by using defaults', () => {
    const result = validatePagination({ limit: Infinity, offset: Infinity });
    expect(result).toEqual({ limit: 20, offset: 0 });
  });

  it('should handle undefined values', () => {
    const result = validatePagination({});
    expect(result).toEqual({ limit: 20, offset: 0 });
  });
});
