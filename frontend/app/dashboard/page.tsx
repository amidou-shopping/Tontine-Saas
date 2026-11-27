'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProfilServeur } from '@/lib/api';
import MemberDashboard from '@/components/MemberDashboard';

export default function DashboardPage() {
  const router = useRouter();
  const [pret, setPret] = useState(false);
  const [prenom, setPrenom] = useState('');
  const [roleActuel, setRoleActuel] = useState('MEMBER');

  useEffect(() => {
    async function verifierAcces() {
      // Le rôle et le prénom du localStorage ne sont pas fiables : on attend
      // la réponse du serveur avant d'afficher l'espace membre.
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
  }, [router]);

  if (!pret) {
    return (
      <div className="mx-auto max-w-shell px-4 py-10 text-body text-muted-canvas">
        Chargement de votre espace...
      </div>
    );
  }

  return <MemberDashboard role={roleActuel} prenom={prenom} />;
}
