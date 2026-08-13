import { SignOutButton } from "@/components/SignOutButton";
import { getUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export default async function NoProfile() {
  const user = await getUser();

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card card-pad anim-scale-in max-w-md text-center">
        <h1 className="text-[20px] font-semibold tracking-tight text-ink-900">
          Your account isn&apos;t set up yet
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-500">
          You signed in successfully, but there is no client record attached to this login yet.
          Ask your photographer to finish setting up the account.
        </p>
        {user?.email ? (
          <p className="ltr-nums mt-4 rounded-xl bg-ink-50 px-3 py-2 font-mono text-[12.5px] text-ink-600">
            {user.email}
          </p>
        ) : null}
        <div className="mt-5">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
