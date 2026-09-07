import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'AI-DLC のとなり', description: 'AI-DLCの工程と確認待ちを、作業画面のとなりで見守るローカルアプリ。', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
