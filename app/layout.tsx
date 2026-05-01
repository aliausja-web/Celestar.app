import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import { LocaleProvider } from '@/lib/i18n/context';

const inter = Inter({ subsets: ['latin'] });

// All pages use Supabase auth at runtime — prevent static prerendering
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Celestar - Execution Readiness Portal',
  description: 'Proof-first execution verification system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <LocaleProvider>
          <Providers>
            {children}
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
