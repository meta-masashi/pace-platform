# ADR-003: Phase 6 Feature Deprecation

**Status:** Accepted
**Date:** 2026-03-25
**Deciders:** PACE Platform Engineering
**Supersedes:** ADR-018, ADR-027, ADR-029, ADR-030, ADR-031

## Context

PACE Platform v3.2 introduced an implementation change directive that refocuses the product on core athletic conditioning and injury prevention workflows. Several Phase 6 features were identified as "noise" that added complexity without proportional value for the current target market (sports medicine teams at the college/professional level).

The affected features are:

1. **Telehealth (Video Consultation)** — Daily.co-based video sessions between staff and athletes (ADR-027, ADR-029)
2. **Insurance Billing Claims** — ICD-10 coding, partner API integration for insurance claim submission (ADR-031)
3. **Enterprise Multi-Org Management** — Parent/child organization hierarchy and cross-org data access (ADR-018)
4. **IMU Sensor Integration** — Polar H10 BLE sensor pairing and PlayerLoad data collection (ADR-030)

## Decision

Remove all application-layer code (API routes, UI components, navigation entries) for the four deprecated features. Retain database tables and Stripe billing infrastructure for data safety and backward compatibility.

### What Was Removed

| Feature | API Routes | UI Pages | ADR Docs | Nav Items |
|---------|-----------|----------|----------|-----------|
| Telehealth | `/api/telehealth/*` (4 routes) | `/telehealth` page | ADR-027, ADR-029 | Sidebar "TeleHealth" |
| Insurance Claims | `/api/billing/claims`, `/api/billing/code` | `/billing` page | ADR-031 | Sidebar "保険請求" |
| Enterprise Mgmt | `/api/enterprise/teams` | `/enterprise` page + dashboard | ADR-018 | (none in sidebar) |
| IMU Sensors | `/api/imu` | (none) | ADR-030 | (none in sidebar) |

### What Was Retained

- **Database tables**: All deprecated tables (`telehealth_sessions`, `telehealth_consent_records`, `telehealth_audit_log`, `billing_codes`, `billing_claims`, `imu_devices`, `imu_sessions`) are kept with deprecation comments (migration 017). No data is dropped.
- **Database migration files**: Original migration SQL files (`20260324_phase6_telehealth.sql`, `20260324_phase6_sprint7_billing_imu.sql`, `20260701_enterprise_orgs.sql`) remain in the migrations directory for schema history.
- **Stripe subscription billing** (`lib/billing/`, `013_billing_tables.sql`): Completely unaffected. The `enterprise` plan type in Stripe pricing remains valid.
- **Enterprise helper functions** (`current_org_id()`, `is_enterprise_admin()`): Retained for RLS policy compatibility and Stripe webhook handling.
- **CV Addon gate** (`src/lib/cv-addon-gate.ts`): Retained as part of billing infrastructure.
- **ICD-10 field in rehabilitation**: The optional ICD-10 code field in the rehabilitation program form is a standard medical coding reference, not part of the deprecated billing claims feature.

## Rationale

1. **Focus**: The platform's core value proposition is conditioning score computation, injury risk triage, and staff workflow optimization. Telehealth, insurance billing, and IMU sensors are adjacent features that can be re-introduced later when market demand justifies the investment.

2. **Data safety**: Tables are not dropped because existing production data may need to be exported or referenced. Deprecation comments in the schema make the status clear to future developers.

3. **Reversibility**: By retaining migration files and database tables, these features can be re-enabled by restoring the application code and running new migrations to update deprecation comments.

4. **Enterprise billing**: The `enterprise` plan type and its Stripe integration remain because they are part of the subscription billing system, not the multi-org management UI.

## Consequences

- Reduced codebase complexity and fewer dependencies (Daily.co SDK, react-native-ble-plx no longer needed)
- Staff dashboard sidebar is cleaner with fewer navigation items
- Future re-introduction of these features will require new application code but can reuse existing database schemas
- Migration 017 adds deprecation comments to all affected tables for developer awareness
