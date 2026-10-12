'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Field, Input } from '@/components/ui'
import { getDb, setSession } from '@/lib/store'

export default function LoginPage() {
  const router = useRouter()
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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-base font-bold text-white">
            D
          </div>
          <h1 className="text-lg font-semibold text-slate-900">DispoFlow AI</h1>
          <p className="mt-1 text-sm text-slate-500">
            Disposition & buyer follow-up management
          </p>
        </div>

        <Card className="p-6">
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
                { email: 'owner@dispoflow.demo', label: 'Dana Whitfield — Owner / Admin' },
                { email: 'sarah@dispoflow.demo', label: 'Sarah Mendez — Team Member' },
                { email: 'marcus@dispoflow.demo', label: 'Marcus Reed — Team Member' },
              ].map((h) => (
                <button
                  key={h.email}
                  type="button"
                  onClick={() => { setEmail(h.email); setPassword('demo1234'); setError(''); }}
                  disabled={loading}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                >
                  <span>{h.label}</span>
                  <span className="text-slate-400">Use</span>
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
