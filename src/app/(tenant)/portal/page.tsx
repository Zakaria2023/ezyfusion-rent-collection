import type { Metadata } from "next";
import { TenantPortal } from "@/components/portal/tenant-portal";

export const metadata: Metadata = { title: "My lease" };

// The portal's data is read in the browser with supabase-js under the
// tenant's own token (docs/TASK.md section 6), so RLS is what scopes it.
const PortalPage = () => <TenantPortal />;

export default PortalPage;
