'use client'

import { Suspense, useEffect, useState } from 'react'
import { useDB, useSession, useLoading, useRefresh } from '@/lib/store'
import AppShell from '@/components/AppShell'
import { computeAlerts, computeKpis, taskStatus } from '@/lib/selectors'
import { ModalsProvider } from '@/components/modals/ModalHost'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const db = useDB()
  const session = useSession()
  const loading = useLoading()
  const refresh = useRefresh()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !session.userId) {
      window.location.href = '/login'
    }
  }, [mounted, session.userId])

  if (!mounted || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      </div>
    )
  }

  if (!session.userId) return null

  const user = session.user ?? db.users.find((u) => u.id === session.userId) ?? null
  if (!user) return null

  const k = computeKpis(db)
  const alerts = computeAlerts(db)
  const overdueCount = db.tasks.filter((t) => taskStatus(t) === 'Overdue').length
  const isOwner = user.role === 'owner'

  const nav = (onClick?: () => void) => (
    <nav className="flex flex-1 flex-col gap-1">
      {[
        { href: '/', label: 'Dashboard', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
        { href: '/properties', label: 'Properties', icon: 'M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5' },
        { href: '/buyers', label: 'Buyers', icon: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
        { href: '/follow-ups', label: 'Follow-Ups', icon: 'M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
        { href: '/offers', label: 'Offers', icon: 'M12 8c-2 0-4 1.5-4 4s2 4 4 4c3 0 4-2 7-2M4 10h2m-2 4h2m-2 12h2' },
        { href: '/activity', label: 'Activity Log', icon: 'M4 6h16M4 12h16M4 18h7' },
        { href: '/reports', label: 'Reports', icon: 'M4 20V10m6 10V4m6 16v-7m4 7H2' },
      ].map((item) => (
        <a
          key={item.href}
          href={item.href}
          onClick={onClick}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            item.href === '/' ? window.location.pathname === '/' : window.location.pathname.startsWith(item.href)
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d={item.icon} />
          </svg>
          <span className="flex-1">{item.label}</span>
          {item.href === '/follow-ups' && overdueCount > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
              window.location.pathname.startsWith('/follow-ups') ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'
            }`}>
              {overdueCount}
            </span>
          )}
        </a>
      ))}
      <div className="my-2 border-t border-slate-200" />
      <a
        href="/settings"
        onClick={onClick}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.3 4.3a1.7 1.7 0 013.4 0 1.7 1.7 0 002.3 1.3 1.7 1.7 0 012.4 2.4 1.7 1.7 0 00-.6 2.6 1.7 1.7 0 01-1.7 2.7 1.7 1.7 0 00-1.6 1.1 1.7 1.7 0 01-3.2 0 1.7 1.7 0 00-1.6-1.1 1.7 1.7 0 01-1.7-2.7 1.7 1.7 0 00-.6-2.6 1.7 1.7 0 012.4-2.4 1.7 1.7 0 001.3-1.3z" />
        </svg>
        Settings
      </a>
      {isOwner && (
        <a
          href="/admin"
          onClick={onClick}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          </svg>
          Admin Panel
        </a>
      )}
    </nav>
  )

  return (
    <ModalsProvider>
      <AppShell
        user={user}
        kpis={k}
        alerts={alerts}
        overdueCount={overdueCount}
        isOwner={isOwner}
        nav={nav}
        refresh={refresh}
      >
        {children}
      </AppShell>
    </ModalsProvider>
  )
}