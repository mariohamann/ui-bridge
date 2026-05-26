import type { Metadata } from 'next';
import { UiBridgeScript } from '@ui-bridge/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UI Bridge — Next.js Demo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === 'development' && <UiBridgeScript />}
      </body>
    </html>
  );
}
