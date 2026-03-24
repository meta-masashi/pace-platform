/**
 * PACE Platform — カレンダートークン暗号化ユーティリティ
 *
 * AES-256-GCM を使用して OAuth トークンを暗号化・復号する。
 * 暗号化キーは環境変数 CALENDAR_ENCRYPTION_KEY から取得する。
 *
 * 暗号化フォーマット: iv:authTag:ciphertext（すべて hex エンコード）
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推奨の IV 長
const AUTH_TAG_LENGTH = 16;
const ENCODING = 'hex' as const;
const SEPARATOR = ':';

// ---------------------------------------------------------------------------
// 暗号化キー取得
// ---------------------------------------------------------------------------

/**
 * 環境変数から暗号化キーを取得し、32 バイトの Buffer に変換する。
 *
 * CALENDAR_ENCRYPTION_KEY は 64 文字の hex 文字列（32 バイト）であること。
 *
 * @throws 環境変数が未設定または不正な形式の場合
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.CALENDAR_ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error(
      'CALENDAR_ENCRYPTION_KEY 環境変数が設定されていません。64 文字の hex 文字列を設定してください。',
    );
  }

  if (keyHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error(
      'CALENDAR_ENCRYPTION_KEY は 64 文字の hex 文字列（256 ビット）である必要があります。',
    );
  }

  return Buffer.from(keyHex, 'hex');
}

// ---------------------------------------------------------------------------
// 暗号化
// ---------------------------------------------------------------------------

/**
 * 平文トークンを AES-256-GCM で暗号化する。
 *
 * @param plaintext 暗号化する平文
 * @returns 暗号化された文字列（iv:authTag:ciphertext 形式）
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString(ENCODING),
    authTag.toString(ENCODING),
    encrypted,
  ].join(SEPARATOR);
}

// ---------------------------------------------------------------------------
// 復号
// ---------------------------------------------------------------------------

/**
 * AES-256-GCM で暗号化されたトークンを復号する。
 *
 * @param encryptedPayload 暗号化された文字列（iv:authTag:ciphertext 形式）
 * @returns 復号された平文
 * @throws 形式が不正、またはキーが異なる場合
 */
export function decryptToken(encryptedPayload: string): string {
  const key = getEncryptionKey();
  const parts = encryptedPayload.split(SEPARATOR);

  if (parts.length !== 3) {
    throw new Error('暗号化トークンの形式が不正です。iv:authTag:ciphertext の形式が必要です。');
  }

  const [ivHex, authTagHex, ciphertext] = parts as [string, string, string];

  const iv = Buffer.from(ivHex, ENCODING);
  const authTag = Buffer.from(authTagHex, ENCODING);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, ENCODING, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
