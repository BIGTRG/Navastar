// Demo-only features (movement/roam simulators) must never run against real
// production operations (Plan of Correction P0 #4). They are enabled outside
// production, or when explicitly opted in with ENABLE_DEMO=true.
export function demoEnabled(): boolean {
  if (process.env.ENABLE_DEMO === "true") return true;
  return process.env.NODE_ENV !== "production";
}
