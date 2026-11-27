'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeftRight, Bell, LayoutGrid, UserRound } from 'lucide-react';
import Header from './Header';

const PAGES_PUBLIQUES = ['/login', '/register', '/verify-otp'];

const LIENS_MOBILE = [
  { href: '/dashboard', label: 'Mes tontines', Icone: LayoutGrid },
  { href: '/transactions', label: 'Transactions', Icone: ArrowLeftRight },
  { href: '/profil#notifications', label: 'Notifications', Icone: Bell },
  { href: '/profil', label: 'Profil', Icone: UserRound },
];

function NavigationMobile() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-header border-t border-line bg-surface md:hidden"
    >
      <div className="mx-auto grid max-w-shell grid-cols-4 gap-1 px-2 pb-2 pt-1">
        {LIENS_MOBILE.map(({ href, label, Icone }) => {
          const cible = href.split('#')[0];
          const actif = pathname === cible && !href.includes('#');
          return (
            <Link
              key={label}
              href={href}
              aria-current={actif ? 'page' : undefined}
              className={`flex min-h-touch flex-col items-center justify-center gap-1 rounded-card px-1 text-meta focus-ring ${
                actif ? 'bg-canvas font-semibold text-ink' : 'font-medium text-muted-canvas'
              }`}
            >
              <Icone className="h-icon w-icon" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const estPagePublique = PAGES_PUBLIQUES.includes(pathname);

  if (estPagePublique) return <>{children}</>;

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-shell px-4 pb-28 pt-6 md:pb-10">{children}</main>
      <NavigationMobile />
    </>
  );
}
