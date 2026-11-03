'use client'

import { useState } from 'react'
import { Button, Card, Field, Input } from '@/components/ui'
import { getDb, setSession } from '@/lib/store'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const db = getDb()
      const user = db.users.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
      )
      if (!user) {
        setError('No account found for that email. Use one of the demo accounts below.')
        return
      }
      if (!user.active) {
        setError('This account has been disabled.')
        return
      }
      if (password.trim().length < 4) {
        setError('Password must be at least 4 characters (demo accepts any).')
        return
      }
      setSession(user.id, user)
      window.location.href = '/'
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_55%_at_50%_-10%,rgba(99,102,241,0.22),transparent_70%)]"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-lg shadow-indigo-950/40">
            D
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-white">DispoFlow AI</h1>
          <p className="mt-1 text-sm text-slate-400">
            Disposition & buyer follow-up management
          </p>
        </div>

        <Card className="p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@company.com"
                autoComplete="email"
                disabled={loading}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
              />
            </Field>
            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium text-slate-500">Demo accounts</p>
            <div className="space-y-1.5">
              {[
                { email: 'owner@dispoflow.demo', label: 'Jason Wade — Owner / Admin' },
                { email: 'sarah@dispoflow.demo', label: 'Sarah Mendez — Team Member' },
                { email: 'marcus@dispoflow.demo', label: 'Marcus Reed — Team Member' },
              ].map((h) => (
                <button
                  key={h.email}
                  type="button"
                  onClick={() => { setEmail(h.email); setPassword('demo1234'); setError(''); }}
                  disabled={loading}
                  className="group flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                >
                  <span>{h.label}</span>
                  <span className="font-medium text-slate-400 transition group-hover:text-slate-600">Use →</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-400">
              Default password for demo accounts: <code className="bg-slate-100 px-1 rounded">demo1234</code>
            </p>
          </div>
        </Card>

        <p className="mt-4 text-center text-[11px] text-slate-400">
          Prototype — data is stored locally in your browser.
        </p>
      </div>
    </div>
  )
}
