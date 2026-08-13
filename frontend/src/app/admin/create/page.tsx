import { requireAdmin } from "@/lib/supabase/session";
import { CreateClientView } from "./CreateClientView";

export const dynamic = "force-dynamic";

export default async function CreateClientPage() {
  await requireAdmin();
  return <CreateClientView />;
}
