import { AppShell } from "@/components/AppShell";
import { requireClient } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireClient();

  return (
    <AppShell
      profile={{
        id: profile.id,
        full_name: profile.full_name,
        username: profile.username,
        role: profile.role,
        avatar_url: profile.avatar_url,
      }}
    >
      {children}
    </AppShell>
  );
}
