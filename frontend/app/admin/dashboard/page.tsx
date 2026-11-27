'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getProfilServeur, extraireMessageErreur } from '@/lib/api';
import { formaterDateComplete, formaterMontant } from '@/lib/affichage';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import StatutBadge from '@/components/ui/StatutBadge';
import Toast from '@/components/ui/Toast';
import RevenueChart from '@/components/admin/RevenueChart';
import UsersTable, { type UtilisateurAdmin } from '@/components/admin/UsersTable';

interface DashboardData {
  chiffreAffaires: { total: number; commissions: number; abonnements: number };
  gmv: { montantTotal: number; nombreTransactions: number };
  utilisateurs: { total: number; bloques: number };
  tontinesActives: number;
}

interface PointRevenu {
  date: string;
  commissions: number;
  abonnements: number;
}

interface TontineSupervision {
  id: string;
  nom: string;
  statut: string;
  codeInvitation: string;
  suppressionDemandeeAt: string | null;
  createur: { nom: string; prenom: string; email: string };
  _count: { membres: number; transactions: number };
}

interface CibleSuppression {
  tontine: TontineSupervision;
  action: 'avertir' | 'supprimer';
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [revenueTimeseries, setRevenueTimeseries] = useState<PointRevenu[]>([]);
  const [users, setUsers] = useState<UtilisateurAdmin[]>([]);
  const [tontines, setTontines] = useState<TontineSupervision[]>([]);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);
  const [suppressionCible, setSuppressionCible] = useState<CibleSuppression | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; ton: 'succes' | 'danger' } | null>(null);

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
      await chargerDonnees();
    }
    void verifierAcces();
  }, []);

  async function chargerDonnees() {
    try {
      setLoading(true);
      setErreur(null);
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
      if (!resDashboard.ok || !resUsers.ok) {
        throw new Error('Impossible de charger le tableau de bord. Réessayez.');
      }

      setDashboard((await resDashboard.json()) as DashboardData);
      // La série de revenus est facultative : on ne touche pas à .data si
      // l'endpoint a échoué, sinon RevenueChart recevrait undefined.
      if (resRevenue.ok) {
        const revenue = await resRevenue.json();
        setRevenueTimeseries(Array.isArray(revenue.data) ? revenue.data : []);
      }
      setUsers((await resUsers.json()).data);
      if (resTontines.ok) setTontines((await resTontines.json()) as TontineSupervision[]);
    } catch (err: any) {
      console.error(err);
      setErreur(err.message || 'Impossible de charger le tableau de bord. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  /** Avertit ou supprime : le serveur revérifie le délai et l'argent engagé. */
  async function actionnerSuppression(cible: CibleSuppression) {
    const { tontine, action } = cible;
    const succes = action === 'avertir' ? 'Avertissement enregistré.' : 'Tontine supprimée.';
    try {
      setActionEnCours(tontine.id);
      const res = await apiFetch(`/api/admin/tontines/${tontine.id}/${action}`, {
        method: 'POST',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extraireMessageErreur(payload, 'Action impossible. Réessayez.'));
      }
      setSuppressionCible(null);
      setToast({ message: extraireMessageErreur(payload, succes), ton: 'succes' });
      await chargerDonnees();
    } catch (err: any) {
      console.error(err);
      setToast({ message: err.message || 'Action impossible. Réessayez.', ton: 'danger' });
    } finally {
      setActionEnCours(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-shell px-4 py-10 text-body text-muted-canvas" role="status">
        Chargement...
      </div>
    );
  }

  if (erreur || !dashboard) {
    return (
      <Card className="mx-auto max-w-content p-6">
        <h1 className="font-display text-section font-semibold text-ink">Administration indisponible</h1>
        <p className="mt-2 text-body text-muted-canvas">
          {erreur ?? 'Impossible de charger le tableau de bord. Réessayez.'}
        </p>
        <Button className="mt-5" onClick={() => void chargerDonnees()}>
          Réessayer
        </Button>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-shell space-y-6 px-4 py-8">
      <div>
        <h1 className="font-display text-section font-semibold text-ink">Administration</h1>
        <p className="mt-1 text-body text-muted-canvas">
          Vue d’ensemble de la plateforme et pilotage des comptes.
        </p>
      </div>

      {toast && (
        <Toast message={toast.message} ton={toast.ton} onFermer={() => setToast(null)} />
      )}

      <Card className="p-5">
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="sm:border-r sm:border-line sm:pr-5">
            <dt className="text-meta text-muted-canvas">Chiffre d’affaires total</dt>
            <dd className="mt-2 font-display text-tile font-semibold tabular-nums text-ink">
              {formaterMontant(dashboard.chiffreAffaires.total)}
            </dd>
            <dd className="mt-2 text-meta text-muted-canvas">
              Commissions : {formaterMontant(dashboard.chiffreAffaires.commissions)} · Abonnements :{' '}
              {formaterMontant(dashboard.chiffreAffaires.abonnements)}
            </dd>
          </div>
          <div className="sm:border-r sm:border-line sm:pr-5">
            <dt className="text-meta text-muted-canvas">GMV (volume traité)</dt>
            <dd className="mt-2 font-display text-tile font-semibold tabular-nums text-ink">
              {formaterMontant(dashboard.gmv.montantTotal)}
            </dd>
            <dd className="mt-2 text-meta text-muted-canvas">
              {dashboard.gmv.nombreTransactions} transaction(s)
            </dd>
          </div>
          <div>
            <dt className="text-meta text-muted-canvas">Utilisateurs</dt>
            <dd className="mt-2 font-display text-tile font-semibold tabular-nums text-ink">
              {dashboard.utilisateurs.total}
            </dd>
            <dd className="mt-2 text-meta text-muted-canvas">
              {dashboard.utilisateurs.bloques} bloqué(s) · {dashboard.tontinesActives} tontine(s)
              active(s)
            </dd>
          </div>
        </dl>
      </Card>

      <RevenueChart data={revenueTimeseries} />

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-section font-semibold text-ink">Utilisateurs</h2>
          <p className="mt-1 text-body text-muted-canvas">
            Bloquez ou débloquez un compte. Les comptes protégés ne peuvent pas être modifiés ici.
          </p>
        </div>
        <UsersTable
          initialUsers={users}
          onMessage={(message, ton) => setToast({ message, ton })}
        />
      </section>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-display text-section font-semibold text-ink">
            Tontines — suppression sécurisée
          </h2>
          <p className="mt-1 text-body text-muted-canvas">
            Un avertissement est obligatoire, puis un délai de 7 jours (configurable) doit
            s’écouler. Toute tontine avec de l’argent engagé est protégée contre la suppression.
          </p>
        </div>

        {tontines.length === 0 ? (
          <p className="text-body text-muted-canvas">Aucune tontine à piloter.</p>
        ) : (
          <ul className="space-y-3">
            {tontines.map((t) => (
              <li key={t.id} className="rounded-card border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-body font-semibold text-ink">{t.nom}</p>
                    <p className="mt-1 text-meta text-muted-canvas">
                      {t.createur.prenom} {t.createur.nom} · {t._count.membres} membre(s) ·{' '}
                      {t._count.transactions} transaction(s)
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatutBadge statut={t.statut} />
                      {t.suppressionDemandeeAt && (
                        <span className="inline-flex rounded-pill border border-warning bg-warning-surface px-3 py-1 text-meta font-medium text-ink">
                          Avertie le {formaterDateComplete(t.suppressionDemandeeAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={actionEnCours === t.id}
                      onClick={() => setSuppressionCible({ tontine: t, action: 'avertir' })}
                    >
                      Avertir
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={actionEnCours === t.id}
                      onClick={() => setSuppressionCible({ tontine: t, action: 'supprimer' })}
                    >
                      Supprimer
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        ouvert={suppressionCible !== null}
        onFermer={() => setSuppressionCible(null)}
        titre={suppressionCible?.action === 'supprimer' ? 'Supprimer la tontine' : 'Avertir les membres'}
      >
        {suppressionCible && (
          <div className="space-y-4">
            <p className="text-body text-muted-canvas">
              {suppressionCible.action === 'avertir'
                ? `Avertir les membres de la tontine « ${suppressionCible.tontine.nom} » d’une suppression programmée ?`
                : `Supprimer définitivement la tontine « ${suppressionCible.tontine.nom} » ? Le serveur refusera s’il reste de l’argent engagé ou si le délai n’est pas écoulé.`}
            </p>
            {suppressionCible.action === 'supprimer' && (
              <p className="text-body text-danger">Cette action est définitive.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={actionEnCours === suppressionCible.tontine.id}
                onClick={() => void actionnerSuppression(suppressionCible)}
              >
                {actionEnCours === suppressionCible.tontine.id
                  ? 'Traitement en cours...'
                  : suppressionCible.action === 'avertir'
                    ? 'Avertir les membres'
                    : 'Supprimer la tontine'}
              </Button>
              <Button
                variant="secondary"
                disabled={actionEnCours === suppressionCible.tontine.id}
                onClick={() => setSuppressionCible(null)}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
