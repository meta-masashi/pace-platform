import type { InferenceState } from "@/lib/bayesian-engine";
import type { AssessmentNode } from "@/types";

// Global singleton session store shared across all API routes.
// Next.js dev server reuses the same module instance, so this persists across requests.
// For production, replace with Redis or Supabase.
declare global {
  // eslint-disable-next-line no-var
  var __paceSessionStore: Map<string, InferenceState> | undefined;
  // eslint-disable-next-line no-var
  var __paceSessionNodes: Map<string, AssessmentNode[]> | undefined;
}

const stateMap: Map<string, InferenceState> =
  global.__paceSessionStore ?? (global.__paceSessionStore = new Map());

const nodesMap: Map<string, AssessmentNode[]> =
  global.__paceSessionNodes ?? (global.__paceSessionNodes = new Map());

export const sessionStore = {
  /** Get the inference state for a session. */
  get(sessionId: string): InferenceState | undefined {
    return stateMap.get(sessionId);
  },

  /** Persist (or overwrite) the inference state for a session. */
  set(sessionId: string, state: InferenceState): void {
    stateMap.set(sessionId, state);
  },

  /** Delete a session entirely (state + nodes). */
  delete(sessionId: string): void {
    stateMap.delete(sessionId);
    nodesMap.delete(sessionId);
  },

  /** Get the cached assessment nodes for a session. */
  getNodes(sessionId: string): AssessmentNode[] | undefined {
    return nodesMap.get(sessionId);
  },

  /** Cache the assessment nodes loaded at session start. */
  setNodes(sessionId: string, nodes: AssessmentNode[]): void {
    nodesMap.set(sessionId, nodes);
  },
};
