'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getProfilServeur, enNombre, extraireMessageErreur } from '@/lib/api';
import RevenueChart from '@/components/admin/RevenueChart';
import UsersTable from '@/components/admin/UsersTable';

interface TontineSupervision {
  id: string;
  nom: string;
  statut: string;
  codeInvitation: string;
  suppressionDemandeeAt: string | null;
  createur: { nom: string; prenom: string; email: string };
  _count: { membres: number; transactions: number };
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<any>(null);
  const [revenueTimeseries, setRevenueTimeseries] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [tontines, setTontines] = useState<TontineSupervision[]>([]);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);
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
      const [resDashboard, resRevenue, resUsers, resTontines] = await Promise.all([
        apiFetch('/api/admin/dashboard'),
        apiFetch('/api/admin/dashboard/revenue-timeseries'),
        apiFetch('/api/admin/users?limit=50'),
        apiFetch('/api/admin/tontines'),
      ]);

      if (
        resDashboard.status === 401 ||
        resRevenue.status === 401 ||
        resUsers.status === 401 ||
        resTontines.status === 401
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
      if (resTontines.ok) setTontines((await resTontines.json()) as TontineSupervision[]);
    } catch (err) {
      console.error(err);
      setErreur('Impossible de charger le tableau de bord.');
    } finally {
      setLoading(false);
    }
  }

  /** Avertit le créateur et les membres avant toute suppression. */
  async function avertirSuppression(id: string, nom: string) {
    if (!confirm(`Avertir les membres de la tontine « ${nom} » d’une suppression programmée ?`)) return;
    await actionnerSuppression(id, 'avertir-suppression', 'Avertissement enregistré.');
  }

  /** Suppression définitive : le serveur revérifie le délai et l'argent engagé. */
  async function supprimerTontine(id: string, nom: string) {
    if (!confirm(`SUPPRIMER définitivement la tontine « ${nom} » ? Le serveur refusera s’il reste de l’argent engagé ou si le délai n’est pas écoulé.`)) return;
    await actionnerSuppression(id, 'supprimer', 'Tontine supprimée.');
  }

  async function actionnerSuppression(id: string, action: string, succes: string) {
    try {
      setActionEnCours(id);
      const res = await apiFetch(`/api/admin/tontines/${id}/${action}`, { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(extraireMessageErreur(payload, 'Action impossible.'));
      alert(extraireMessageErreur(payload, succes));
      chargerDonnees();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Action impossible.');
    } finally {
      setActionEnCours(null);
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

      {/* Suppression sécurisée des tontines (Phase 3) */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Tontines — suppression sécurisée</h2>
          <p className="text-xs text-gray-500">
            Un avertissement est obligatoire, puis un délai de 7 jours (configurable) doit s’écouler.
            Toute tontine avec de l’argent engagé est définitivement protégée contre la suppression.
          </p>
        </div>
        {tontines.length === 0 && (
          <p className="text-sm text-gray-400">Aucune tontine.</p>
        )}
        <div className="space-y-2">
          {tontines.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-gray-100 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{t.nom}</p>
                <p className="text-xs text-gray-500">
                  {t.createur.prenom} {t.createur.nom} · {t._count.membres} membre(s) ·{' '}
                  {t._count.transactions} transaction(s) · {t.statut}
                </p>
                {t.suppressionDemandeeAt && (
                  <p className="text-xs text-amber-700">
                    Avertie le {new Date(t.suppressionDemandeeAt).toLocaleDateString('fr-FR')}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => avertirSuppression(t.id, t.nom)}
                  disabled={actionEnCours === t.id}
                  className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800 disabled:opacity-40"
                >
                  Avertir
                </button>
                <button
                  onClick={() => supprimerTontine(t.id, t.nom)}
                  disabled={actionEnCours === t.id}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
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
