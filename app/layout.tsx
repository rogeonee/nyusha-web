import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nyusha Chat',
  description: 'Тестовый чат с Gemini Flash 2.0',
};

export const viewport = {
  maximumScale: 1, // Disable auto-zoom on mobile Safari
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Toaster position="top-center" />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
