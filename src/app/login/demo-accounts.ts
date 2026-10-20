// Seeded demo accounts (scripts/seed.ts); all share one password.
export const DEMO_PASSWORD = "Rentals2026!";

export const DEMO_ACCOUNTS = [
  { email: "manager@northwind.test", label: "Manager" },
  { email: "staff@northwind.test", label: "Staff" },
  { email: "aisyah@northwind.test", label: "Tenant" },
] as const;
