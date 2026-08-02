import { loadConfig } from "./config.js";
import { runSingleCheck } from "./index.js";

void runSingleCheck(loadConfig()).catch((error: unknown) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    message: "Single monitoring check failed.",
    error: error instanceof Error ? error.message : String(error)
  }));
  process.exitCode = 1;
});
