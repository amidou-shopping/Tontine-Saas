import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'Tontine SaaS',
  description: 'Gestion moderne et sécurisée de vos tontines sénégalaises.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Navigation />
        {children}
      </body>
    </html>
  );
}
