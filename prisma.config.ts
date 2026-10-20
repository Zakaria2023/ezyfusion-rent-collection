import { defineConfig } from "prisma/config";

// The schema lives in supabase/migrations (SQL). Prisma only introspects it
// (`pnpm db:pull`) and generates the typed client — no `prisma migrate`.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on variables already set in the environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
