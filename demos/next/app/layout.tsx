import type { Metadata } from 'next';
import { DesignBridgeScript } from '@design-bridge/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Design Bridge — Next.js Demo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === 'development' && <DesignBridgeScript />}
      </body>
    </html>
  );
}
