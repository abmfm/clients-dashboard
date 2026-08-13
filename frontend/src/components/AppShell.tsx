"use client";

import {
  FolderOpen,
  Calendar,
  Send,
  User,
  Settings,
  LayoutDashboard,
  Users,
  PlusSquare,
  Menu,
  Stethoscope,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LanguageToggle } from "./LanguageToggle";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { SignOutButton } from "./SignOutButton";
import { ThemeToggle } from "./ThemeToggle";
import { useNavBadges } from "@/lib/hooks/useNavBadges";
import { useI18n } from "@/lib/i18n/provider";
import type { Profile } from "@/lib/types";
import { cx, initials } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ElementType; badge?: number };

export function AppShell({
  profile,
  children,
}: {
  profile: Pick<Profile, "id" | "full_name" | "username" | "role" | "avatar_url">;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const badges = useNavBadges(profile.id);

  const isAdmin = profile.role === "admin";

  const primary: NavItem[] = isAdmin
    ? [
        { href: "/admin/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
        { href: "/admin/clients", label: t.nav.clients, icon: Users },
        { href: "/admin/sessions", label: t.nav.sessions, icon: Calendar, badge: badges.sessions },
        { href: "/admin/projects", label: t.nav.projects, icon: FolderOpen },
        { href: "/admin/requests", label: t.nav.requests, icon: Send, badge: badges.requests },
        { href: "/admin/create", label: t.nav.create, icon: PlusSquare },
      ]
    : [
        { href: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
        { href: "/projects", label: t.nav.myProjects, icon: FolderOpen },
        { href: "/sessions", label: t.nav.sessions, icon: Calendar, badge: badges.sessions },
        { href: "/requests", label: t.nav.requests, icon: Send, badge: badges.requests },
      ];

  const secondary: NavItem[] = isAdmin
    ? [
        { href: "/admin/diagnose", label: t.diagnose.title, icon: Stethoscope },
        { href: "/admin/settings", label: t.nav.settings, icon: Settings },
      ]
    : [
        { href: "/profile", label: t.nav.profile, icon: User },
        { href: "/settings", label: t.nav.settings, icon: Settings },
      ];

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = pathname === item.href || pathname.startsWith(item.href + "/");
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={cx("nav-link group", active ? "nav-link-active" : "nav-link-idle")}
      >
        <Icon
          size={19}
          strokeWidth={1.9}
          className="transition-transform duration-200 group-hover:scale-110"
        />
        {item.label}

        {item.badge ? (
          <span
            className={cx(
              "anim-scale-in ltr-nums ms-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5",
              "text-[11.5px] font-semibold tabular-nums",
              active ? "bg-brand-600 text-canvas" : "bg-rose-500 text-white"
            )}
            aria-label={`${item.badge} pending`}
          >
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo size={36} className="transition-transform duration-300 hover:rotate-3" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight text-ink-900">
            {t.brand}
          </p>
          <p className="truncate text-[11.5px] text-ink-400">{t.brandTag}</p>
        </div>
        <button
          className="ms-auto rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {primary.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        <div className="my-3 border-t border-ink-200/70" />

        {secondary.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      <div className="border-t border-ink-200/70 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[13px] font-semibold text-canvas shadow-sm">
            {initials(profile.full_name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-ink-900">{profile.full_name}</p>
            <p className="ltr-nums truncate text-[12px] text-ink-400">@{profile.username}</p>
          </div>
        </div>
        <SignOutButton className="btn-ghost btn-sm w-full" />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 border-e border-ink-200/70 bg-surface/80 backdrop-blur lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="anim-fade-in absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="anim-slide-in-start absolute inset-y-0 start-0 w-[280px] bg-surface shadow-pop">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200/70 bg-canvas/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <button
            className="rounded-xl p-2 text-ink-600 hover:bg-ink-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle compact />
            <LanguageToggle compact />
            <NotificationBell userId={profile.id} />
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[12.5px] font-semibold text-canvas shadow-sm ring-2 ring-surface">
              {initials(profile.full_name)}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden px-4 pb-12 pt-6 sm:px-6 lg:px-8">
          <div key={pathname} className="anim-page mx-auto w-full max-w-[1240px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
