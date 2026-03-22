export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { mockAthletes, mockAuditLogs, mockEscalations } from "@/lib/mock-data";
import { StatsClient } from "./StatsClient";
import type { Athlete, AuditLog, EscalationRecord, Role } from "@/types";

export default async function StatsPage() {
  let athletes: Athlete[] = [];
  let auditLogs: AuditLog[] = [];
  let escalations: EscalationRecord[] = [];

  try {
    const supabase = await createClient();

    // Fetch active athletes
    const { data: athleteRows, error: athleteError } = await supabase
      .from("athletes")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (!athleteError && athleteRows && athleteRows.length > 0) {
      athletes = athleteRows as Athlete[];
    }

    // Fetch audit logs
    const { data: logRows, error: logError } = await supabase
      .from("audit_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(50);

    if (!logError && logRows && logRows.length > 0) {
      auditLogs = logRows as AuditLog[];
    }

    // Build escalation-like records from daily_metrics where acwr > 1.3 or nrs_pain >= 7
    const { data: metricRows, error: metricError } = await supabase
      .from("daily_metrics")
      .select("*")
      .or("acwr.gt.1.3,nrs_pain.gte.7")
      .order("metric_date", { ascending: false })
      .limit(20);

    if (!metricError && metricRows && metricRows.length > 0) {
      escalations = metricRows.map((row, idx) => ({
        id: row.id ?? String(idx),
        created_at: row.metric_date ?? new Date().toISOString(),
        from_staff_id: row.staff_id ?? "",
        from_staff_name: row.staff_name ?? "Staff",
        from_role: (row.staff_role ?? "AT") as Role,
        to_roles: ["PT"] as Role[],
        athlete_id: row.athlete_id ?? "",
        athlete_name: row.athlete_name ?? "—",
        severity: (row.acwr > 1.5 || row.nrs_pain >= 8 ? "urgent" : "high") as EscalationRecord["severity"],
        message: `ACWR: ${row.acwr ?? "—"} / NRS: ${row.nrs_pain ?? "—"}`,
        audit_log_id: row.id ?? "",
        acknowledged_at: row.resolved_at ?? undefined,
        acknowledged_by_name: row.resolved_by ?? undefined,
      }));
    }
  } catch (err) {
    console.warn("[stats] Supabase query failed, falling back to mock data:", err);
  }

  // Fall back to mock data if Supabase returned empty
  if (athletes.length === 0) athletes = mockAthletes;
  if (auditLogs.length === 0) auditLogs = mockAuditLogs;
  if (escalations.length === 0) escalations = mockEscalations;

  return (
    <StatsClient
      athletes={athletes}
      auditLogs={auditLogs}
      escalations={escalations}
    />
  );
}
