import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'tradeviw — free charting, backtesting & market analysis',
  description:
    'The free, open alternative to TradingView. Charts, indicators, and a real-data backtester with no paywall and no feature gates.',
  applicationName: 'tradeviw',
};

export const viewport: Viewport = {
  themeColor: '#0a0c10',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
