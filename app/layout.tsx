import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DispoFlow AI — Disposition workspace',
  description: 'A clearer way to manage buyer follow-up and real estate disposition.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
