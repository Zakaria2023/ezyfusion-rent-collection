import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

type GlobalWithPrisma = typeof globalThis & { prisma?: PrismaClient };

const globalForPrisma: GlobalWithPrisma = globalThis;

const createPrismaClient = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
};

// Connects as the `postgres` role, which BYPASSES Row Level Security.
// Every caller must authorize the user first (see CLAUDE.md → Auth).
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
