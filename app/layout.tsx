import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MindLog - 心情與照片隨筆 PWA',
  description: '隨時記錄心情與照片標籤的離線優先 PWA',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className="antialiased bg-slate-100">{children}</body>
    </html>
  );
}