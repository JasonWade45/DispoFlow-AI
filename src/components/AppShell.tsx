"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isFirst } from "@/lib/format";
import SyncBanner from "@/components/SyncBanner";

interface AppShellProps {
  children: ReactNode;
  user: {
    id: string;
    name: string;
    email: string;
    role: 'owner' | 'team';
  };
  kpis: {
    overdue: number;
    dueToday: number;
    upcoming: number;
    unscheduled: number;
    activeProperties: number;
    activeBuyers: number;
    openOffers: number;
    completedToday: number;
  };
  alerts: Array<{ id: string; severity: string; title: string; body: string; href: string }>;
  overdueCount: number;
  isOwner: boolean;
  nav: (onClick?: () => void) => ReactNode;
}

export default function AppShell({
  children,
  user,
  kpis,
  isOwner,
  nav,
}: AppShellProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-slate-100 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
            D
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">DispoFlow AI</p>
            <p className="text-[11px] text-slate-400">{kpis.activeProperties} properties · {kpis.activeBuyers} buyers</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto p-3">{nav()}</div>
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
              {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium text-slate-800">{user.name}</p>
              <p className="truncate text-[11px] capitalize text-slate-400">
                {isOwner ? "Owner / Admin" : "Team Member"}
              </p>
            </div>
            <button
              onClick={() => router.replace("/api/auth") }
              title="Sign out"
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-100 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                  D
                </div>
                <p className="text-sm font-semibold text-slate-900">DispoFlow AI</p>
              </div>
              <button onClick={() => setMenuOpen(false)} className="p-1 text-slate-400" aria-label="Close menu">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto p-3">{nav(() => setMenuOpen(false))}</div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button
            onClick={() => setMenuOpen(true)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="hidden items-center gap-4 text-xs text-slate-500 sm:flex">
            <span>
              <b className="text-slate-800">{kpis.activeProperties}</b> active properties
            </span>
            <span className="text-slate-300">|</span>
            <span>
              <b className="text-slate-800">{kpis.activeBuyers}</b> active buyers
            </span>
            <span className="text-slate-300">|</span>
            <span>
              <b className={kpis.overdue > 0 ? "text-rose-600" : "text-slate-800"}>{kpis.overdue}</b> overdue
            </span>
          </div>

          <div className="flex-1" />

          <div className="relative">
            <button
              onClick={() => setUserMenu((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700">
                {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </div>
              <span className="hidden text-xs font-medium text-slate-700 sm:block">{isFirst(user.name)}</span>
            </button>
            {userMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                <div className="absolute right-0 z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="text-xs font-medium text-slate-800">{user.name}</p>
                    <p className="text-[11px] text-slate-400">{user.email}</p>
                  </div>
                  <Link href="/settings" className="block px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
                    Settings
                  </Link>
                  <button
                    onClick={() => router.replace("/api/auth") }
                    className="block w-full px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <SyncBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
