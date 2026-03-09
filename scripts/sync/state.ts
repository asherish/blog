import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SYNC_STATE_PATH = path.resolve(
  import.meta.dirname,
  "../../.sync-state.json"
);
const MAPPING_PATH = path.resolve(
  import.meta.dirname,
  "../../.devto-mapping.json"
);

// --- Sync State (.sync-state.json) ---

export interface SyncEntry {
  jaHash: string;
  enHash: string;
}

export type SyncState = Record<string, SyncEntry>;

export function loadSyncState(): SyncState {
  try {
    return JSON.parse(fs.readFileSync(SYNC_STATE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function saveSyncState(state: SyncState): void {
  fs.writeFileSync(SYNC_STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

export function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// --- dev.to Mapping (.devto-mapping.json) ---

export interface MappingEntry {
  devtoId?: number;
}

export type Mapping = Record<string, MappingEntry>;

export function loadMapping(): Mapping {
  try {
    return JSON.parse(fs.readFileSync(MAPPING_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function saveMapping(mapping: Mapping): void {
  fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2) + "\n");
}
