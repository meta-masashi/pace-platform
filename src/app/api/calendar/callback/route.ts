import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

function encrypt(text: string): string {
  const key = process.env.CALENDAR_ENCRYPTION_KEY;
  if (!key) throw new Error("CALENDAR_ENCRYPTION_KEY not set");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    iv
  );
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

/**
 * Google Calendar OAuth — Step 2: Handle callback
 * GET /api/calendar/callback?code=...&state=...
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") || "/schedule";
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`${state}?calendar_error=consent_denied`, req.url)
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/calendar/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("No access token received");
    }

    // Get staff info
    const { data: staff } = await supabase
      .from("staff")
      .select("id, organization_id")
      .eq("auth_user_id", user.id)
      .single();

    // Encrypt tokens before storage
    const accessTokenEncrypted = encrypt(tokens.access_token);
    const refreshTokenEncrypted = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : null;

    // Upsert calendar connection
    await supabase.from("calendar_connections").upsert(
      {
        staff_id: staff?.id ?? user.id,
        organization_id: staff?.organization_id,
        provider: "google",
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
        scopes: tokens.scope ?? "",
        connected_at: new Date().toISOString(),
      },
      { onConflict: "staff_id,provider" }
    );

    return NextResponse.redirect(
      new URL(`${state}?calendar_connected=true`, req.url)
    );
  } catch (err) {
    console.error("Calendar OAuth callback error:", err);
    return NextResponse.redirect(
      new URL(`${state}?calendar_error=token_exchange_failed`, req.url)
    );
  }
}
