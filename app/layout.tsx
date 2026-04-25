import './globals.css';
import type { Metadata } from 'next';
import { DM_Sans, Space_Grotesk } from 'next/font/google';
import { Providers } from '@/components/providers';
import { LocaleProvider } from '@/lib/i18n/context';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-heading',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

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
      <body className={`${dmSans.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <LocaleProvider>
          <Providers>
            {children}
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
