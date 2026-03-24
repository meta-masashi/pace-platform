/**
 * Supabase Edge Function: phi-audit-log
 *
 * PHI（Protected Health Information）アクセスを audit_phi_access テーブルに記録する。
 * HIPAA 準拠（ADR-019）: 医療情報へのアクセスはすべて監査可能でなければならない。
 *
 * 呼び出し方（Next.js API Route から）:
 *   await supabaseServiceRole.functions.invoke('phi-audit-log', {
 *     body: {
 *       user_id: string,
 *       resource_type: 'athlete' | 'soap_note' | 'cv_session' | 'daily_metrics' | 'assessment',
 *       resource_id: string,
 *       action: 'read' | 'write' | 'delete' | 'export',
 *       org_id: string,
 *       ip_address?: string,
 *       user_agent?: string,
 *     }
 *   })
 *
 * エラーは飲み込み（監査ログ失敗で主機能をブロックしない）。
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface AuditPayload {
  user_id: string;
  resource_type: "athlete" | "soap_note" | "cv_session" | "daily_metrics" | "assessment";
  resource_id: string;
  action: "read" | "write" | "delete" | "export";
  org_id: string;
  ip_address?: string;
  user_agent?: string;
  additional_context?: Record<string, unknown>;
}

serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let payload: AuditPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  // 必須フィールドの検証
  const required: Array<keyof AuditPayload> = ["user_id", "resource_type", "resource_id", "action", "org_id"];
  for (const field of required) {
    if (!payload[field]) {
      return new Response(JSON.stringify({ error: `Missing required field: ${field}` }), { status: 400 });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { error } = await supabase.from("audit_phi_access").insert({
      user_id: payload.user_id,
      resource_type: payload.resource_type,
      resource_id: payload.resource_id,
      action: payload.action,
      org_id: payload.org_id,
      ip_address: payload.ip_address ?? null,
      user_agent: payload.user_agent ?? null,
      additional_context: payload.additional_context ?? null,
      accessed_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[phi-audit-log] insert error:", error.message);
      // 監査ログ失敗は 200 で返す（主機能をブロックしない）
      return new Response(JSON.stringify({ logged: false, error: error.message }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ logged: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[phi-audit-log] unexpected error:", err);
    return new Response(JSON.stringify({ logged: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
