import { ReactNode } from 'react';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-20 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
