import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './foundation.css';
import '../ui/styles.css';
import { App } from './App';

export const metadata: Metadata = {
  title: { default: 'FGO Lab', template: '%s | FGO Lab' },
  description: 'FGOの宝具ダメージと育成を端末内で管理する非公式ツール',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = { themeColor: '#18233a' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <App />
        {children}
      </body>
    </html>
  );
}
