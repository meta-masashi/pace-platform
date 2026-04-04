/**
 * PACE Platform — Platform Admin 認可ヘルパー
 *
 * lib/api/platform-admin-guard.ts の再エクスポート。
 * 設計書 (architecture-v1.3-auth-admin.md セクション 3.4) では
 * lib/auth/platform-admin.ts にも配置指定があるため、
 * 既存の guard モジュールへの alias を提供する。
 */

export {
  requirePlatformAdmin,
  writeAuditLog,
  type PlatformAdminAuth,
  type PlatformAdminGuardResult,
  type AuditLogParams,
} from '@/lib/api/platform-admin-guard';
