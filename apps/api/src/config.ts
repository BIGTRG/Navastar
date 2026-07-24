// Load the repo-root .env before anything reads process.env, then hand off to
// the validated loader in @navastar/shared.
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadEnv } from "@navastar/shared";

const here = dirname(fileURLToPath(import.meta.url)); // apps/api/src
// Prefer a local apps/api/.env, else the monorepo root .env.
const candidates = [resolve(here, "../.env"), resolve(here, "../../../.env")];
for (const path of candidates) {
  if (existsSync(path)) {
    dotenvConfig({ path });
    break;
  }
}

export const env = loadEnv();
