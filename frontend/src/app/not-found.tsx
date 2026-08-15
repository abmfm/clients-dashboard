import Link from "next/link";

import { LogoWordmark } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="anim-fade-up flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <LogoWordmark height={44} />
      <div>
        <p className="text-[56px] font-semibold leading-none tracking-tight text-ink-900">404</p>
        <p className="mt-3 text-[15px] text-ink-500">That page doesn&apos;t exist.</p>
      </div>
      <Link href="/" className="btn-dark">
        Back to dashboard
      </Link>
    </main>
  );
}
