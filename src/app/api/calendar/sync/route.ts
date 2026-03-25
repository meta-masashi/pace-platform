import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

function decrypt(encryptedText: string): string {
  const key = process.env.CALENDAR_ENCRYPTION_KEY;
  if (!key) throw new Error("CALENDAR_ENCRYPTION_KEY not set");
  const [ivHex, tagHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    iv
  );
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function classifyEventType(summary: string): string {
  const lower = summary.toLowerCase();
  if (/match|試合|game|リーグ/.test(lower)) return "match";
  if (/高強度|intense|hard|sprint/.test(lower)) return "high_intensity";
  if (/休|off|rest|recovery/.test(lower)) return "rest";
  if (/travel|移動|away/.test(lower)) return "travel";
  return "training";
}

/**
 * POST /api/calendar/sync — Fetch Google Calendar events and save to schedule_events
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get staff and calendar connection
    const { data: staff } = await supabase
      .from("staff")
      .select("id, team_id, organization_id")
      .eq("auth_user_id", user.id)
      .single();

    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const { data: connection } = await supabase
      .from("calendar_connections")
      .select("*")
      .eq("staff_id", staff.id)
      .eq("provider", "google")
      .single();

    if (!connection?.access_token_encrypted) {
      return NextResponse.json(
        { error: "Google Calendar not connected" },
        { status: 400 }
      );
    }

    // Decrypt tokens
    const accessToken = decrypt(connection.access_token_encrypted);
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });

    // Fetch events for the next 30 days
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const eventsRes = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: thirtyDaysLater.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });

    const events = eventsRes.data.items ?? [];

    // Upsert events to schedule_events
    let synced = 0;
    for (const event of events) {
      if (!event.summary || !event.start) continue;

      const startTime =
        event.start.dateTime ?? `${event.start.date}T00:00:00Z`;
      const endTime =
        event.end?.dateTime ?? event.end?.date
          ? `${event.end.date}T23:59:59Z`
          : startTime;

      const { error } = await supabase.from("schedule_events").upsert(
        {
          team_id: staff.team_id,
          created_by_staff_id: staff.id,
          title: event.summary,
          event_type: classifyEventType(event.summary),
          start_time: startTime,
          end_time: endTime,
          location: event.location ?? null,
          notes: event.description ?? null,
          google_event_id: event.id,
        },
        { onConflict: "google_event_id" }
      );

      if (!error) synced++;
    }

    return NextResponse.json({
      success: true,
      synced_count: synced,
      total_fetched: events.length,
    });
  } catch (err) {
    console.error("Calendar sync error:", err);
    return NextResponse.json(
      { error: "Failed to sync calendar" },
      { status: 500 }
    );
  }
}
