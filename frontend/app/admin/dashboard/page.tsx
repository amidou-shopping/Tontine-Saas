'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getProfilServeur, enNombre } from '@/lib/api';
import RevenueChart from '@/components/admin/RevenueChart';
import UsersTable from '@/components/admin/UsersTable';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<any>(null);
  const [revenueTimeseries, setRevenueTimeseries] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    async function verifierAcces() {
      // Le rôle est vérifié auprès de l'API, jamais déduit du localStorage.
      const profil = await getProfilServeur<{ role: string }>();
      if (!profil) {
        router.push('/login');
        return;
      }
      if (profil.role !== 'SUPER_ADMIN') {
        router.push('/dashboard');
        return;
      }
      chargerDonnees();
    }
    verifierAcces();
  }, []);

  async function chargerDonnees() {
    try {
      setLoading(true);
      const [resDashboard, resRevenue, resUsers] = await Promise.all([
        apiFetch('/api/admin/dashboard'),
        apiFetch('/api/admin/dashboard/revenue-timeseries'),
        apiFetch('/api/admin/users?limit=50'),
      ]);

      if (
        resDashboard.status === 401 ||
        resRevenue.status === 401 ||
        resUsers.status === 401
      ) {
        router.push('/login');
        return;
      }
      if (!resDashboard.ok || !resUsers.ok) throw new Error('Erreur de chargement.');

      setDashboard(await resDashboard.json());
      // La série de revenus est facultative : on ne touche pas à .data si
      // l'endpoint a échoué, sinon RevenueChart recevrait undefined.
      if (resRevenue.ok) {
        const revenue = await resRevenue.json();
        setRevenueTimeseries(Array.isArray(revenue.data) ? revenue.data : []);
      }
      setUsers((await resUsers.json()).data);
    } catch (err) {
      console.error(err);
      setErreur('Impossible de charger le tableau de bord.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Chargement...</div>;
  if (erreur || !dashboard) return <div className="p-8 text-center text-red-600">{erreur}</div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Tableau de bord Super-Admin</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          titre="Chiffre d'affaires total"
          valeur={`${enNombre(dashboard.chiffreAffaires.total).toLocaleString('fr-FR')} FCFA`}
          detail={`Commissions: ${enNombre(dashboard.chiffreAffaires.commissions).toLocaleString('fr-FR')} · Abonnements: ${enNombre(dashboard.chiffreAffaires.abonnements).toLocaleString('fr-FR')}`}
        />
        <KpiCard
          titre="GMV (volume traité)"
          valeur={`${enNombre(dashboard.gmv.montantTotal).toLocaleString('fr-FR')} FCFA`}
          detail={`${dashboard.gmv.nombreTransactions} transactions`}
        />
        <KpiCard
          titre="Utilisateurs"
          valeur={String(dashboard.utilisateurs.total)}
          detail={`${dashboard.utilisateurs.bloques} bloqué(s) · ${dashboard.tontinesActives} tontines actives`}
        />
      </div>

      <RevenueChart data={revenueTimeseries} />

      <UsersTable initialUsers={users} />
    </div>
  );
}

function KpiCard({ titre, valeur, detail }: { titre: string; valeur: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{titre}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{valeur}</p>
      <p className="text-xs text-gray-400 mt-1">{detail}</p>
    </div>
  );
}
