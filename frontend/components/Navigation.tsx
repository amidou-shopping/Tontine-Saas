'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getProfilServeur, getToken } from '@/lib/api';
import NotificationsBell from './NotificationsBell';

const PAGES_PUBLIQUES = ['/login', '/register', '/verify-otp'];

export default function Navigation() {
  const pathname = usePathname();
  const estPagePublique = PAGES_PUBLIQUES.includes(pathname);

  // État initial identique sur le serveur et le client : on lit le rôle dans
  // un effet (et auprès de l'API) pour éviter les avertissements d'hydratation.
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (estPagePublique || !getToken()) return;
    let actif = true;
    getProfilServeur<{ role: string }>().then((profil) => {
      if (actif) setRole(profil?.role ?? null);
    });
    return () => {
      actif = false;
    };
  }, [estPagePublique]);

  // Ne pas afficher la navigation sur les pages de login/register/verify-otp
  if (estPagePublique) {
    return null;
  }

  const links = [
    { href: '/dashboard', label: 'Mes tontines', show: true },
    { href: '/transactions', label: 'Transactions', show: true },
    { href: '/profil', label: 'Profil', show: true },
    { href: '/admin-tontines', label: 'Gérer', show: role === 'ADMIN_TONTINE' || role === 'SUPER_ADMIN' },
    { href: '/admin/dashboard', label: 'Admin', show: role === 'SUPER_ADMIN' },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-2">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        <Link href="/dashboard" className="font-bold text-gray-900">
          Tontine SaaS
        </Link>
        <div className="flex items-center gap-4">
          {links.filter((l) => l.show).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm font-medium ${
                pathname === l.href ? 'text-sky-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {l.label}
            </Link>
          ))}
          <NotificationsBell />
        </div>
      </div>
    </nav>
  );
}
