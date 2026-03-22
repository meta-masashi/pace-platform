export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
// import { mockScheduleEvents, mockAttendance, mockStaff } from "@/lib/mock-data";
import { ScheduleClient } from "./ScheduleClient";
import type { ScheduleEvent, AttendanceRecord, Staff } from "@/types";

export default async function SchedulePage() {
  let scheduleEvents: ScheduleEvent[] = [];
  let attendance: AttendanceRecord[] = [];
  let staff: Staff[] = [];

  try {
    const supabase = await createClient();

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const thirtyDaysAhead = new Date(now);
    thirtyDaysAhead.setDate(now.getDate() + 30);

    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
    const thirtyDaysAheadISO = thirtyDaysAhead.toISOString();

    // Fetch schedule events in window
    const { data: eventRows, error: eventError } = await supabase
      .from("schedule_events")
      .select("*")
      .gte("start_time", thirtyDaysAgoISO)
      .lte("start_time", thirtyDaysAheadISO)
      .order("start_time");

    if (!eventError && eventRows && eventRows.length > 0) {
      // Normalize DB rows: start_time/end_time are TIMESTAMPTZ, extract date + HH:MM
      scheduleEvents = eventRows.map((row) => {
        const startDt = new Date(row.start_time as string);
        const endDt = row.end_time ? new Date(row.end_time as string) : startDt;
        const dateStr = startDt.toISOString().slice(0, 10);
        const startTimeStr = `${String(startDt.getHours()).padStart(2, "0")}:${String(startDt.getMinutes()).padStart(2, "0")}`;
        const endTimeStr = `${String(endDt.getHours()).padStart(2, "0")}:${String(endDt.getMinutes()).padStart(2, "0")}`;
        return {
          ...row,
          date: dateStr,
          start_time: startTimeStr,
          end_time: endTimeStr,
          created_by_staff_id: (row.created_by_staff_id ?? row.created_by ?? "") as string,
        } as ScheduleEvent;
      });
    }

    // Fetch active staff
    const { data: staffRows, error: staffError } = await supabase
      .from("staff")
      .select("*")
      .eq("is_active", true);

    if (!staffError && staffRows && staffRows.length > 0) {
      staff = staffRows as Staff[];
    }

    // Fetch attendance — gracefully handle missing table
    try {
      const { data: attRows, error: attError } = await supabase
        .from("attendance")
        .select("*");

      if (!attError && attRows) {
        attendance = attRows as AttendanceRecord[];
      }
    } catch {
      attendance = [];
    }
  } catch (err) {
    console.error("[schedule] Supabase query failed:", err);
    // Return empty arrays — no mock fallback
  }

  return (
    <ScheduleClient
      scheduleEvents={scheduleEvents}
      attendance={attendance}
      staff={staff}
    />
  );
}
