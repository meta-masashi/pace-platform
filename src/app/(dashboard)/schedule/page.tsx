export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { mockScheduleEvents, mockAttendance, mockStaff } from "@/lib/mock-data";
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
      scheduleEvents = eventRows as ScheduleEvent[];
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
    console.warn("[schedule] Supabase query failed, falling back to mock data:", err);
  }

  // Fall back to mock data if Supabase returned empty
  if (scheduleEvents.length === 0) scheduleEvents = mockScheduleEvents;
  if (staff.length === 0) staff = mockStaff;
  if (attendance.length === 0) attendance = mockAttendance;

  return (
    <ScheduleClient
      scheduleEvents={scheduleEvents}
      attendance={attendance}
      staff={staff}
    />
  );
}
