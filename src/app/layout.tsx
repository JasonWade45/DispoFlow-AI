import type { Metadata } from 'next'
import './globals.css'
import { DBProvider } from '@/lib/store'

export const metadata: Metadata = {
  title: 'DispoFlow AI',
  description: 'AI-powered real estate disposition and buyer follow-up management for wholesaling teams.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <DBProvider>{children}</DBProvider>
      </body>
    </html>
  )
}