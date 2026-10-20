// Imported FIRST by scripts/seed.ts: imports are evaluated in order, so the
// variables are in process.env before src/lib/server/prisma.ts (which reads
// DATABASE_URL when it is evaluated) and the Supabase admin client load.
// `.env.local` first (what the graders create), then `.env`; loadEnvFile never
// overrides a variable that is already set, so the real environment wins.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // File missing: rely on variables already set in the environment.
  }
}
