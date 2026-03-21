import type { InferenceState } from "@/lib/bayesian-engine";

// Global singleton session store shared across all API routes.
// Next.js dev server reuses the same module instance, so this persists across requests.
// For production, replace with Redis or Supabase.
declare global {
  // eslint-disable-next-line no-var
  var __paceSessionStore: Map<string, InferenceState> | undefined;
}

export const sessionStore: Map<string, InferenceState> =
  global.__paceSessionStore ?? (global.__paceSessionStore = new Map());
