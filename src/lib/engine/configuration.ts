import { configSchema, PRESETS, type AnalysisConfig } from "./domain";

/** Range/branch are associations, not engine settings; they do not invalidate a position cache. */
export async function configurationHash(input: AnalysisConfig): Promise<string> {
  const config = configSchema.parse(input);
  const bytes = new TextEncoder().encode(JSON.stringify(["uci-search-v1", "white-scores-v1", PRESETS[config.preset], config.multiPv]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
