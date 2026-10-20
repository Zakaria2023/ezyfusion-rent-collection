import { existsSync } from "node:fs";

// Same precedence as Next.js: .env.local first, then .env. loadEnvFile never
// overwrites a variable that is already set, so the first file wins.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}
