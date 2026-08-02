import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface MonitorState {
  readonly version: 1;
  readonly lastPrice: number | null;
  readonly wasQualifying: boolean;
  readonly updatedAt: string;
}

export const EMPTY_STATE: MonitorState = {
  version: 1,
  lastPrice: null,
  wasQualifying: false,
  updatedAt: ""
};

function isState(value: unknown): value is MonitorState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<MonitorState>;
  return state.version === 1 &&
    (state.lastPrice === null || (typeof state.lastPrice === "number" && Number.isFinite(state.lastPrice))) &&
    typeof state.wasQualifying === "boolean" && typeof state.updatedAt === "string";
}

export async function readState(path: string): Promise<MonitorState> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isState(value)) throw new Error("invalid state shape");
    return value;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return EMPTY_STATE;
    }
    throw new Error(`Could not read monitor state at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function writeState(path: string, state: MonitorState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}
