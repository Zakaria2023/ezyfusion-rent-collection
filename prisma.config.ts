import { defineConfig } from "prisma/config";

// The schema lives in supabase/migrations (SQL). Prisma only introspects it
// (`pnpm db:pull`) and generates the typed client — no `prisma migrate`.
// `.env.local` first (what the graders create), then `.env`. loadEnvFile
// never overrides a variable that is already set.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // File missing: rely on variables already set in the environment.
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
