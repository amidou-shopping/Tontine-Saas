'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProfilServeur, clearSession } from '@/lib/api';
import MemberDashboard from '@/components/MemberDashboard';

export default function DashboardPage() {
  const router = useRouter();
  const [pret, setPret] = useState(false);
  const [prenom, setPrenom] = useState('');
  const [roleActuel, setRoleActuel] = useState('MEMBER');

  useEffect(() => {
    async function verifierAcces() {
      // On attend la réponse du serveur avant d'afficher l'espace membre :
      // le rôle et le prénom du localStorage ne sont pas fiables.
      const profil = await getProfilServeur<{ prenom: string; role: string }>();
      if (!profil || !profil.role) {
        router.push('/login');
        return;
      }
      setPrenom(profil.prenom ?? '');
      setRoleActuel(profil.role);
      setPret(true);
    }
    verifierAcces();
  }, []);

  function deconnexion() {
    clearSession();
    router.push('/login');
  }

  if (!pret) return <div className="p-8 text-center text-gray-500">Chargement...</div>;

  return (
    <div>
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <span className="font-semibold text-gray-900">Bonjour, {prenom} 👋</span>
        <button onClick={deconnexion} className="text-sm text-gray-500 underline">
          Déconnexion
        </button>
      </header>
      <MemberDashboard role={roleActuel} />
    </div>
  );
}
