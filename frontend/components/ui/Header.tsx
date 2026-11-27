'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { clearSession, getCurrentUser, getProfilServeur, getToken } from '@/lib/api';
import NotificationsBell from '@/components/NotificationsBell';
import SupportButton from '@/components/SupportButton';

interface ProfilHeader {
  prenom?: string;
  nom?: string;
  role?: string;
}

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [menuOuvert, setMenuOuvert] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  // Le rôle affiché vient du serveur ; le localStorage ne sert qu'au prénom
  // provisoire affiché pendant le chargement.
  useEffect(() => {
    let actif = true;
    const local = getCurrentUser<ProfilHeader>();
    if (local?.prenom) setPrenom(local.prenom);
    if (local?.nom) setNom(local.nom);
    if (!getToken()) return;

    getProfilServeur<ProfilHeader>().then((profil) => {
      if (!actif || !profil) return;
      setRole(profil.role ?? null);
      setPrenom(profil.prenom ?? local?.prenom ?? '');
      setNom(profil.nom ?? local?.nom ?? '');
    });
    return () => {
      actif = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!menuOuvert) return;
    function fermerAuClic(event: MouseEvent) {
      if (menu.current && !menu.current.contains(event.target as Node)) setMenuOuvert(false);
    }
    function fermerAvecEchap(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOuvert(false);
    }
    document.addEventListener('mousedown', fermerAuClic);
    document.addEventListener('keydown', fermerAvecEchap);
    return () => {
      document.removeEventListener('mousedown', fermerAuClic);
      document.removeEventListener('keydown', fermerAvecEchap);
    };
  }, [menuOuvert]);

  const liens = [
    { href: '/dashboard', label: 'Mes tontines' },
    { href: '/transactions', label: 'Transactions' },
    ...(role === 'ADMIN_TONTINE' || role === 'SUPER_ADMIN'
      ? [{ href: '/admin-tontines', label: 'Gérer' }]
      : []),
    ...(role === 'SUPER_ADMIN' ? [{ href: '/admin/dashboard', label: 'Admin' }] : []),
  ];

  function deconnexion() {
    clearSession();
    router.push('/login');
  }

  const initiales = `${prenom.charAt(0)}${nom.charAt(0)}` || '…';

  return (
    <header className="sticky top-0 z-header px-4 pt-4">
      <div className="mx-auto flex max-w-shell items-center justify-between gap-4 rounded-card border border-line bg-surface px-4 py-2">
        <Link
          href="/dashboard"
          className="flex min-h-touch items-center gap-3 rounded-pill focus-ring"
          aria-label="Tontine, retour à l’accueil"
        >
          <span
            className="flex h-control w-control items-center justify-center rounded-pill bg-accent font-display text-lead font-semibold text-surface"
            aria-hidden="true"
          >
            T
          </span>
          <span className="font-display text-lead font-semibold text-ink">Tontine</span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-1 md:flex">
          {liens.map((lien) => {
            const actif = pathname === lien.href;
            return (
              <Link
                key={lien.href}
                href={lien.href}
                aria-current={actif ? 'page' : undefined}
                className={`inline-flex min-h-touch items-center rounded-pill px-4 text-body font-medium focus-ring ${
                  actif ? 'bg-black text-surface' : 'text-muted-canvas hover:bg-canvas'
                }`}
              >
                {lien.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <NotificationsBell />
          <SupportButton variante="header" />
          <div className="relative" ref={menu}>
            <button
              type="button"
              onClick={() => setMenuOuvert((etat) => !etat)}
              aria-expanded={menuOuvert}
              aria-label="Ouvrir le menu du compte"
              className="flex min-h-touch items-center gap-2 rounded-pill px-2 text-ink hover:bg-canvas focus-ring"
            >
              <span
                className="flex h-touch w-touch items-center justify-center rounded-pill bg-canvas font-display text-body font-semibold text-ink"
                aria-hidden="true"
              >
                {initiales}
              </span>
              <span className="hidden max-w-40 truncate text-body font-medium sm:block">
                {prenom || 'Mon compte'}
              </span>
              <ChevronDown className="h-icon-sm w-icon-sm" aria-hidden="true" />
            </button>

            {menuOuvert && (
              <div className="absolute right-0 z-floating mt-2 w-56 rounded-card border border-line bg-surface p-2 shadow-floating">
                <Link
                  href="/profil"
                  onClick={() => setMenuOuvert(false)}
                  className="flex min-h-touch items-center gap-3 rounded-control px-3 text-body text-ink hover:bg-canvas focus-ring"
                >
                  <UserRound className="h-icon-sm w-icon-sm" aria-hidden="true" />
                  Profil
                </Link>
                <button
                  type="button"
                  onClick={deconnexion}
                  className="flex min-h-touch w-full items-center gap-3 rounded-control px-3 text-body text-danger hover:bg-danger-surface focus-ring"
                >
                  <LogOut className="h-icon-sm w-icon-sm" aria-hidden="true" />
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
