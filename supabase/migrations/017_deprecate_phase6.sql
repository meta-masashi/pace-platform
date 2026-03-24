-- =============================================================================
-- Migration 017: Phase 6 Feature Deprecation Comments
-- Date: 2026-03-25
-- Author: PACE Platform Engineering
-- Reference: ADR-003-feature-deprecation, implementation-change-directive.md
--
-- Purpose:
--   Mark deprecated Phase 6 tables with COMMENT to indicate deprecation status.
--   Tables are NOT dropped to preserve data safety and allow future data export.
--   Application code referencing these tables has been removed.
--
-- Deprecated features:
--   1. Telehealth (ADR-027, ADR-029) - Video consultation via Daily.co
--   2. Insurance Billing Claims (ADR-031) - ICD-10 coding & partner API
--   3. IMU Sensor Integration (ADR-030) - Polar H10 BLE sensor data
--   4. Enterprise Multi-Org Management (ADR-018) - Parent/child org hierarchy
--
-- Idempotent: COMMENT ON is safe to re-run.
-- =============================================================================

-- =============================================================================
-- 1. Telehealth tables (from 20260324_phase6_telehealth.sql)
-- =============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telehealth_sessions') THEN
    COMMENT ON TABLE telehealth_sessions IS
      '[DEPRECATED 2026-03-25] TeleHealth video session management. '
      'Feature removed per implementation-change-directive v3.2. '
      'Table retained for data safety — do NOT drop without explicit approval. '
      'Original ADR: ADR-027-telehealth-architecture.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telehealth_consent_records') THEN
    COMMENT ON TABLE telehealth_consent_records IS
      '[DEPRECATED 2026-03-25] TeleHealth consent records (legal compliance). '
      'Feature removed per implementation-change-directive v3.2. '
      'Table retained for data safety — do NOT drop without explicit approval. '
      'Original ADR: ADR-027-telehealth-architecture.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telehealth_audit_log') THEN
    COMMENT ON TABLE telehealth_audit_log IS
      '[DEPRECATED 2026-03-25] TeleHealth immutable audit log. '
      'Feature removed per implementation-change-directive v3.2. '
      'Table retained for data safety — do NOT drop without explicit approval. '
      'Original ADR: ADR-027-telehealth-architecture.';
  END IF;
END $$;

-- =============================================================================
-- 2. Insurance Billing Claims tables (from 20260324_phase6_sprint7_billing_imu.sql)
-- =============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_codes') THEN
    COMMENT ON TABLE billing_codes IS
      '[DEPRECATED 2026-03-25] ICD-10-CM / diagnosis code master table. '
      'Insurance billing claims feature removed per implementation-change-directive v3.2. '
      'Table retained for data safety — do NOT drop without explicit approval. '
      'Original ADR: ADR-031-billing-partner-api. '
      'NOTE: Stripe subscription billing (013_billing_tables.sql) is NOT deprecated.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_claims') THEN
    COMMENT ON TABLE billing_claims IS
      '[DEPRECATED 2026-03-25] Insurance billing claim records. '
      'Insurance billing claims feature removed per implementation-change-directive v3.2. '
      'Table retained for data safety — do NOT drop without explicit approval. '
      'Original ADR: ADR-031-billing-partner-api. '
      'NOTE: Stripe subscription billing (013_billing_tables.sql) is NOT deprecated.';
  END IF;
END $$;

-- =============================================================================
-- 3. IMU Sensor tables (from 20260324_phase6_sprint7_billing_imu.sql)
-- =============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'imu_devices') THEN
    COMMENT ON TABLE imu_devices IS
      '[DEPRECATED 2026-03-25] IMU/BLE sensor device pairing (Polar H10). '
      'Feature removed per implementation-change-directive v3.2. '
      'Table retained for data safety — do NOT drop without explicit approval. '
      'Original ADR: ADR-030-imu-sensor-vendor.';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'imu_sessions') THEN
    COMMENT ON TABLE imu_sessions IS
      '[DEPRECATED 2026-03-25] IMU sensor session data (PlayerLoad, HR, HRV). '
      'Feature removed per implementation-change-directive v3.2. '
      'Table retained for data safety — do NOT drop without explicit approval. '
      'Original ADR: ADR-030-imu-sensor-vendor.';
  END IF;
END $$;

-- =============================================================================
-- 4. Enterprise Multi-Org Management (from 20260701_enterprise_orgs.sql)
--    NOTE: The enterprise plan_type enum value, Stripe billing columns, and
--    helper functions (current_org_id, is_enterprise_admin) are retained as
--    they are used by the Stripe subscription billing system.
--    Only the multi-org management UI and API routes have been removed.
-- =============================================================================

-- Add deprecation note to enterprise-specific RLS policies
DO $$ BEGIN
  -- The enterprise admin RLS policies remain functional but the management UI
  -- has been removed. Document this for future reference.
  COMMENT ON FUNCTION is_enterprise_admin() IS
    '[PARTIALLY DEPRECATED 2026-03-25] Enterprise admin check function. '
    'Enterprise management UI removed per implementation-change-directive v3.2. '
    'Function retained for RLS policies and Stripe billing compatibility.';
END $$;
