'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { apiFetch, enNombre, extraireMessageErreur, getCurrentUser } from '@/lib/api';
import { construireTours, formaterDate, formaterMontant, libelleType } from '@/lib/affichage';
import { LIBELLES_JOURS, type JourSemaine } from '@/lib/jours-semaine';
import AccentCard from '@/components/ui/AccentCard';
import Button, { buttonClasses } from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import PaymentModal from '@/components/ui/PaymentModal';
import StatutBadge from '@/components/ui/StatutBadge';
import Toast from '@/components/ui/Toast';
import TourCalendar from '@/components/ui/TourCalendar';

interface MembreTontine {
  id: string;
  ordrePassage: number;
  statut: string;
  aDejaRecu: boolean;
  dateReception: string | null;
  user: {
    id: string;
    nom: string;
    prenom: string;
    email: string;
    telephone: string;
  };
}

interface Transaction {
  id: string;
  type: string;
  statut: string;
  montantBrut: number;
  montantCommission: number;
  montantNet: number;
  provider: string | null;
  cycleConcerne: number | null;
  createdAt: string;
}

interface ResumeTontine {
  id: string;
  montantCotisation: number;
  statutCotisation: 'PAYE' | 'EN_ATTENTE' | 'EN_RETARD' | 'ARRIERE';
  arriere?: {
    cycle: number;
    amende: number;
    montantTotal: number;
  } | null;
}

interface DetailTontine {
  id: string;
  nom: string;
  description: string | null;
  type: string;
  montantCotisation: number;
  frequence: string;
  jourCotisation: JourSemaine;
  tauxCommission: number;
  nombreMaxMembres: number;
  statut: string;
  dateDebut: string | null;
  cycleActuel: number;
  codeInvitation: string;
  createur: {
    id: string;
    nom: string;
    prenom: string;
    email: string;
    telephone: string;
  };
  membres: MembreTontine[];
  transactions: Transaction[];
}

function creerColonnesMembres(
  utilisateurId: string,
  cycleActuel: number,
): Column<MembreTontine>[] {
  return [
    {
      key: 'tour',
      header: 'Tour',
      render: (m) => <span className="tabular-nums font-semibold">{m.ordrePassage}</span>,
    },
    {
      key: 'membre',
      header: 'Membre',
      render: (m) => {
        const initiales = `${m.user.prenom.charAt(0)}${m.user.nom.charAt(0)}`;
        return (
          <div className="flex items-center gap-3">
            <span
              className="flex h-touch w-touch shrink-0 items-center justify-center rounded-pill bg-canvas font-display text-body font-semibold text-ink"
              aria-hidden="true"
            >
              {initiales}
            </span>
            <span>
              <span className="font-medium text-ink">
                {m.user.prenom} {m.user.nom}
              </span>
              {m.user.id === utilisateurId && (
                <span className="ml-2 text-meta font-medium text-muted-canvas">Vous</span>
              )}
            </span>
          </div>
        );
      },
    },
    {
      key: 'statut',
      header: 'Statut',
      align: 'right',
      render: (m) => {
        if (m.statut === 'EXCLU') return <StatutBadge statut="EXCLU" />;
        if (m.aDejaRecu) {
          return (
            <span className="rounded-pill bg-success-surface px-3 py-1 text-meta font-medium text-success">
              A reçu
            </span>
          );
        }
        if (m.ordrePassage === cycleActuel) {
          return (
            <span className="rounded-pill bg-canvas px-3 py-1 text-meta font-medium text-muted-canvas">
              Tour en cours
            </span>
          );
        }
        return (
          <span className="rounded-pill bg-canvas px-3 py-1 text-meta font-medium text-muted-canvas">
            À venir
          </span>
        );
      },
    },
  ];
}

const COLONNES_TRANSACTIONS: Column<Transaction>[] = [
  { key: 'date', header: 'Date', render: (t) => formaterDate(t.createdAt) },
  {
    key: 'operation',
    header: 'Opération',
    render: (t) => (
      <div>
        <p className="font-medium text-ink">{libelleType(t.type)}</p>
        <p className="text-meta text-muted-canvas">
          {t.cycleConcerne ? `Tour ${t.cycleConcerne}` : 'Tour non précisé'}
        </p>
      </div>
    ),
  },
  {
    key: 'montant',
    header: 'Montant',
    align: 'right',
    render: (t) => (
      <span className="tabular-nums font-semibold">{formaterMontant(enNombre(t.montantBrut))}</span>
    ),
  },
  { key: 'statut', header: 'Statut', align: 'right', render: (t) => <StatutBadge statut={t.statut} /> },
];

export default function TontineDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [tontine, setTontine] = useState<DetailTontine | null>(null);
  const [utilisateurId, setUtilisateurId] = useState('');
  const [resume, setResume] = useState<ResumeTontine | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tentative, setTentative] = useState(0);
  const [paiementOuvert, setPaiementOuvert] = useState(false);
  const [paiementEnCours, setPaiementEnCours] = useState(false);
  const [messageSucces, setMessageSucces] = useState<string | null>(null);
  const [messageErreurPaiement, setMessageErreurPaiement] = useState<string | null>(null);

  useEffect(() => {
    const utilisateur = getCurrentUser<{ id: string }>();
    if (!utilisateur) {
      router.push('/login');
      return;
    }
    setUtilisateurId(utilisateur.id);
  }, [router]);

  useEffect(() => {
    let actif = true;
    async function chargerDetail() {
      setLoading(true);
      setErreur(null);
      try {
        const res = await apiFetch(`/api/member/tontines/${id}`);
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          if (actif) {
            setErreur(
              `${extraireMessageErreur(payload, 'Impossible de charger cette tontine.')} Réessayez.`,
            );
          }
          return;
        }
        const data: DetailTontine = await res.json();
        if (!actif) return;
        setTontine({
          ...data,
          montantCotisation: enNombre(data.montantCotisation),
          transactions: (data.transactions ?? []).map((t) => ({
            ...t,
            montantBrut: enNombre(t.montantBrut),
            montantCommission: enNombre(t.montantCommission),
            montantNet: enNombre(t.montantNet),
          })),
        });
      } catch (err) {
        console.error(err);
        if (actif) setErreur('Une erreur est survenue. Réessayez.');
      } finally {
        if (actif) setLoading(false);
      }
    }
    chargerDetail();
    return () => {
      actif = false;
    };
  }, [id, tentative]);

  // Le résumé `/member/tontines` fournit l’état de cotisation et l’arriéré,
  // absents du détail. Son échec n’empêche pas l’affichage de la tontine.
  useEffect(() => {
    let actif = true;
    async function chargerResume() {
      try {
        const res = await apiFetch('/api/member/tontines');
        if (!res.ok) return;
        const data: ResumeTontine[] = await res.json();
        if (!actif) return;
        const trouve = data.find((t) => t.id === id);
        setResume(
          trouve
            ? {
                ...trouve,
                montantCotisation: enNombre(trouve.montantCotisation),
              }
            : null,
        );
      } catch (err) {
        console.error(err);
      }
    }
    chargerResume();
    return () => {
      actif = false;
    };
  }, [id, tentative]);

  async function confirmerPaiement(provider: string) {
    setMessageErreurPaiement(null);
    setPaiementEnCours(true);
    try {
      const cycleConcerne = resume?.arriere?.cycle;
      const res = await apiFetch(`/api/member/tontines/${id}/payer`, {
        method: 'POST',
        body: JSON.stringify({
          provider,
          ...(cycleConcerne ? { cycleConcerne } : {}),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(extraireMessageErreur(payload, 'Le paiement a échoué.'));
      }
      setPaiementOuvert(false);
      setMessageSucces(
        cycleConcerne
          ? 'Arriéré réglé. Vous pouvez maintenant payer le tour en cours.'
          : 'Cotisation payée.',
      );
      setTentative((n) => n + 1);
    } catch (err: any) {
      setMessageErreurPaiement(err.message || 'Le paiement a échoué. Réessayez.');
    } finally {
      setPaiementEnCours(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-shell px-4 py-10 text-body text-muted-canvas">
        Chargement de la tontine...
      </div>
    );
  }

  if (erreur || !tontine) {
    return (
      <Card className="mx-auto max-w-content p-6">
        <h1 className="font-display text-section font-semibold text-ink">
          {erreur ? 'Détail indisponible' : 'Tontine introuvable'}
        </h1>
        <p className="mt-2 text-body text-muted-canvas">
          {erreur ?? 'Cette tontine est introuvable ou vous n’y avez pas accès.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => setTentative((n) => n + 1)}>Réessayer</Button>
          <Link href="/dashboard" className={buttonClasses('secondary')}>
            Retour aux tontines
          </Link>
        </div>
      </Card>
    );
  }

  const colonnesMembres = creerColonnesMembres(utilisateurId, tontine.cycleActuel);
  const monMembre = tontine.membres.find((m) => m.user.id === utilisateurId);
  const monTour = monMembre?.ordrePassage;
  const estExclu = monMembre?.statut === 'EXCLU';
  const estMonTour = typeof monTour === 'number' && monTour === tontine.cycleActuel;
  const tours = construireTours(
    { cycleActuel: tontine.cycleActuel, monTour },
    tontine.membres,
  );
  const libelleJour = tontine.jourCotisation
    ? LIBELLES_JOURS[tontine.jourCotisation]
      ? LIBELLES_JOURS[tontine.jourCotisation].charAt(0).toUpperCase() +
        LIBELLES_JOURS[tontine.jourCotisation].slice(1)
      : tontine.jourCotisation
    : 'Non défini';

  const montantACotiser = resume?.montantCotisation ?? tontine.montantCotisation;
  const amende = resume?.arriere?.amende ?? 0;
  const totalAPayer = resume?.arriere?.montantTotal ?? montantACotiser;
  const cycleConcerne = resume?.arriere?.cycle ?? null;
  const dejaPaye = resume?.statutCotisation === 'PAYE' && !resume.arriere;
  const peutPayer = !estExclu && !dejaPaye;

  return (
    <div className="mx-auto max-w-shell space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex min-h-touch items-center rounded-pill px-3 text-body font-medium text-muted-canvas hover:bg-surface focus-ring"
      >
        Retour à mes tontines
      </Link>

      {(messageErreurPaiement || messageSucces) && (
        <Toast
          message={(messageErreurPaiement ?? messageSucces) as string}
          ton={messageErreurPaiement ? 'danger' : 'succes'}
          onFermer={() => {
            setMessageErreurPaiement(null);
            setMessageSucces(null);
          }}
        />
      )}

      {estExclu && (
        <Card className="border-danger bg-danger-surface p-5">
          <h2 className="font-display text-lead font-semibold text-danger">
            Vous avez été exclu de cette tontine.
          </h2>
          <p className="mt-2 text-body text-ink">
            Les cotisations et amendes déjà réglées vous seront remboursées à la clôture. Vous ne
            pouvez plus effectuer de paiement ici.
          </p>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-section font-semibold text-ink">{tontine.nom}</h1>
            {tontine.description && (
              <p className="mt-1 text-body text-muted-canvas">{tontine.description}</p>
            )}
          </div>
          <StatutBadge statut={tontine.statut} />
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-meta text-muted-canvas">Cotisation</dt>
            <dd className="mt-1 font-display text-lead font-semibold tabular-nums text-ink">
              {formaterMontant(tontine.montantCotisation)}
            </dd>
          </div>
          <div>
            <dt className="text-meta text-muted-canvas">Jour de cotisation</dt>
            <dd className="mt-1 text-body font-semibold text-ink">{libelleJour}</dd>
          </div>
          <div>
            <dt className="text-meta text-muted-canvas">Cycle actuel</dt>
            <dd className="mt-1 font-display text-lead font-semibold tabular-nums text-ink">
              {tontine.cycleActuel}
            </dd>
          </div>
          <div>
            <dt className="text-meta text-muted-canvas">Membres</dt>
            <dd className="mt-1 font-display text-lead font-semibold tabular-nums text-ink">
              {tontine.membres.length}/{tontine.nombreMaxMembres}
            </dd>
          </div>
        </dl>

        <div className="mt-5 rounded-card border border-line bg-canvas p-4">
          <p className="text-meta text-muted-canvas">Code d’invitation</p>
          <p className="mt-1 select-all font-display text-lead font-semibold tracking-wider text-ink">
            {tontine.codeInvitation}
          </p>
        </div>

        {peutPayer ? (
          <Button className="mt-5 w-full" onClick={() => setPaiementOuvert(true)}>
            Payer ma cotisation
          </Button>
        ) : (
          !estExclu && (
            <p className="mt-5 text-body text-muted-canvas">Aucune cotisation à régler pour ce tour.</p>
          )
        )}
      </Card>

      {estMonTour && (
        <AccentCard className="p-5">
          <p className="text-meta font-medium text-surface">Vous recevez la cagnotte</p>
          <p className="mt-2 font-display text-lead font-semibold">
            C’est votre tour, cycle {tontine.cycleActuel}.
          </p>
        </AccentCard>
      )}

      <Card className="p-5">
        <h2 className="font-display text-section font-semibold text-ink">Calendrier des tours</h2>
        <p className="mt-1 text-body text-muted-canvas">
          Le tour {tontine.cycleActuel} est en cours. Votre rang est{' '}
          {typeof monTour === 'number' ? `n° ${monTour}` : 'inconnu'}.
        </p>
        <div className="mt-5">
          {tours.length > 0 ? (
            <TourCalendar tours={tours} legende={`Calendrier des tours de ${tontine.nom}`} />
          ) : (
            <p className="text-body text-muted-canvas">Le calendrier n’est pas encore disponible.</p>
          )}
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="font-display text-section font-semibold text-ink">
          Ordre de passage ({tontine.membres.length})
        </h2>
        <DataTable
          columns={colonnesMembres}
          rows={tontine.membres.slice().sort((a, b) => a.ordrePassage - b.ordrePassage)}
          getRowKey={(m) => m.id}
          caption="Membres classés par ordre de passage"
          vide="Aucun membre inscrit."
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-section font-semibold text-ink">
          Historique ({tontine.transactions.length})
        </h2>
        {tontine.transactions.length === 0 ? (
          <EmptyState
            titre="Aucune transaction"
            description="Les paiements de cette tontine apparaîtront ici."
          />
        ) : (
          <DataTable
            columns={COLONNES_TRANSACTIONS}
            rows={tontine.transactions}
            getRowKey={(t) => t.id}
            caption="Transactions de la tontine"
          />
        )}
      </section>

      <PaymentModal
        ouvert={paiementOuvert}
        onFermer={() => setPaiementOuvert(false)}
        tontineNom={tontine.nom}
        montantCotisation={montantACotiser}
        amende={amende}
        total={totalAPayer}
        cycleConcerne={cycleConcerne}
        enCours={paiementEnCours}
        onConfirmer={(provider) => {
          void confirmerPaiement(provider);
        }}
      />
    </div>
  );
}
