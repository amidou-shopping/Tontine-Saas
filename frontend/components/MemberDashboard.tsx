'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  apiFetch,
  enNombre,
  extraireMessageErreur,
  getCurrentUser,
  getToken,
  setSession,
} from '@/lib/api';
import { construireTours, formaterDate, formaterMontant, libelleType } from '@/lib/affichage';
import { extraireCotisationsDues, type CotisationDue } from '@/lib/cotisations';
import { JOURS_SEMAINE, LIBELLES_JOURS, texteDuree, type JourSemaine } from '@/lib/jours-semaine';
import AccentCard from '@/components/ui/AccentCard';
import Button, { buttonClasses } from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import CotisationsAPayer from '@/components/CotisationsAPayer';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import PaymentModal from '@/components/ui/PaymentModal';
import Select from '@/components/ui/Select';
import StatTile from '@/components/ui/StatTile';
import StatutBadge from '@/components/ui/StatutBadge';
import SupportButton from '@/components/SupportButton';
import Textarea from '@/components/ui/Textarea';
import Toast from '@/components/ui/Toast';
import TourCalendar from '@/components/ui/TourCalendar';

interface Arriere {
  cycle: number;
  cotisationDue: number;
  amende: number;
  montantTotal: number;
  dateEcheance: string;
}

interface TontineResume {
  id: string;
  nom: string;
  description?: string | null;
  montantCotisation: number;
  frequence?: string;
  prochainEcheance?: string;
  monTour?: number;
  cycleActuel?: number;
  statutCotisation: 'PAYE' | 'EN_ATTENTE' | 'EN_RETARD' | 'ARRIERE';
  arriere?: Arriere | null;
  codeInvitation?: string;
}

interface TransactionMembre {
  id: string;
  type: string;
  statut: string;
  montantBrut: number;
  montantCommission: number;
  montantNet: number;
  createdAt: string;
  tontineNom?: string | null;
  [cle: string]: unknown;
}

interface TontineDisponible {
  id: string;
  nom: string;
  description: string | null;
  montantCotisation: number;
  frequence: string;
  nombreMaxMembres: number;
  createurId: string;
  _count: { membres: number };
}

interface TontineCreee {
  id: string;
  nom: string;
  codeInvitation: string;
}

interface DemandeAdhesion {
  id: string;
  statut: 'EN_ATTENTE' | 'ACCEPTEE' | 'REFUSEE';
  motifRefus: string | null;
  createdAt: string;
  tontine: { id: string; nom: string; codeInvitation: string; statut: string };
}

interface MembreDetail {
  membres: { userId: string; ordrePassage: number }[];
}

const PROVIDERS = [
  { id: 'WAVE', label: 'Wave' },
  { id: 'ORANGE_MONEY', label: 'Orange Money' },
] as const;

const COLONNES_ACTIVITES: Column<TransactionMembre>[] = [
  { key: 'date', header: 'Date', render: (t) => formaterDate(t.createdAt) },
  {
    key: 'activite',
    header: 'Activité',
    render: (t) => (
      <div>
        <p className="font-medium text-ink">{libelleType(t.type)}</p>
        <p className="text-meta text-muted-canvas">{t.tontineNom ?? 'Tontine'}</p>
      </div>
    ),
  },
  {
    key: 'montant',
    header: 'Montant',
    align: 'right',
    render: (t) => (
      <span className="tabular-nums font-semibold">{formaterMontant(enNombre(t.montantNet))}</span>
    ),
  },
  { key: 'statut', header: 'Statut', align: 'right', render: (t) => <StatutBadge statut={t.statut} /> },
];

export default function MemberDashboard({ role, prenom }: { role: string; prenom: string }) {
  const router = useRouter();
  const [tontines, setTontines] = useState<TontineResume[]>([]);
  const [tontinesDisponibles, setTontinesDisponibles] = useState<TontineDisponible[]>([]);
  const [transactions, setTransactions] = useState<TransactionMembre[]>([]);
  const [transactionsChargees, setTransactionsChargees] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cotisationEnPaiement, setCotisationEnPaiement] = useState<CotisationDue | null>(null);
  const [paiementEnCours, setPaiementEnCours] = useState(false);
  const [messageSucces, setMessageSucces] = useState<string | null>(null);
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const [rejoindreEnCours, setRejoindreEnCours] = useState<string | null>(null);
  const [roleActuel, setRoleActuel] = useState(role);
  const [utilisateurConnecteId, setUtilisateurConnecteId] = useState<string | null>(null);
  const [devenirAdminEnCours, setDevenirAdminEnCours] = useState(false);
  const [fraisPassageAdmin, setFraisPassageAdmin] = useState<number | null>(null);
  const [providerPassageAdmin, setProviderPassageAdmin] = useState('WAVE');
  const [referencePassageAdmin, setReferencePassageAdmin] = useState<string | null>(null);
  const [demandes, setDemandes] = useState<DemandeAdhesion[]>([]);
  const [tontineSelectionnee, setTontineSelectionnee] = useState('');
  const [detailTontine, setDetailTontine] = useState<MembreDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErreur, setDetailErreur] = useState<string | null>(null);

  const peutCreer = roleActuel === 'ADMIN_TONTINE' || roleActuel === 'SUPER_ADMIN';
  const prixPassageAdmin =
    fraisPassageAdmin === null ? '...' : formaterMontant(fraisPassageAdmin);

  const [modalCreationOuverte, setModalCreationOuverte] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [nouvelleTontine, setNouvelleTontine] = useState<TontineCreee | null>(null);
  const [formTontine, setFormTontine] = useState({
    nom: '',
    description: '',
    montantCotisation: '',
    jourCotisation: 'LUNDI' as JourSemaine,
    nombreMaxMembres: '10',
  });

  const [codeInvitation, setCodeInvitation] = useState('');
  const [rejoindreParCodeEnCours, setRejoindreParCodeEnCours] = useState(false);

  useEffect(() => {
    setUtilisateurConnecteId(getCurrentUser<{ id: string }>()?.id ?? null);
    fetchMesTontines();
    fetchTontinesDisponibles();
    fetchMesDemandes();
    fetchTarifPassageAdmin();
    fetchTransactions();
  }, []);

  useEffect(() => {
    if (tontines.length > 0 && !tontines.some((t) => t.id === tontineSelectionnee)) {
      setTontineSelectionnee(tontines[0].id);
    }
  }, [tontines, tontineSelectionnee]);

  useEffect(() => {
    if (!tontineSelectionnee) {
      setDetailTontine(null);
      return;
    }
    let actif = true;
    setDetailLoading(true);
    setDetailErreur(null);
    apiFetch(`/api/member/tontines/${tontineSelectionnee}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Impossible de charger le calendrier.');
        const data = (await res.json()) as MembreDetail;
        if (actif) setDetailTontine(data);
      })
      .catch((err: Error) => {
        if (actif) setDetailErreur(`${err.message} Réessayez en rouvrant la page.`);
      })
      .finally(() => {
        if (actif) setDetailLoading(false);
      });
    return () => {
      actif = false;
    };
  }, [tontineSelectionnee]);

  /** Prix serveur (FRAIS_PASSAGE_ADMIN ou valeur de la table singleton). */
  async function fetchTarifPassageAdmin() {
    try {
      const res = await apiFetch('/api/member/devenir-admin/tarif');
      if (res.ok) {
        const payload = (await res.json()) as { fraisPassageAdminFcfa: number };
        setFraisPassageAdmin(enNombre(payload.fraisPassageAdminFcfa));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchMesTontines() {
    try {
      setLoading(true);
      const res = await apiFetch('/api/member/tontines');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Erreur de chargement des tontines');
      const data: TontineResume[] = await res.json();
      setTontines(data.map((t) => ({ ...t, montantCotisation: enNombre(t.montantCotisation) })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTransactions() {
    try {
      const res = await apiFetch('/api/member/transactions');
      if (!res.ok) throw new Error('Erreur de chargement des transactions');
      const payload = (await res.json().catch(() => ({}))) ?? {};
      const liste: unknown = Array.isArray(payload) ? payload : payload.data ?? [];
      const transactionsRecues = Array.isArray(liste) ? (liste as TransactionMembre[]) : [];
      setTransactions(
        transactionsRecues.map((t) => ({
          ...t,
          montantBrut: enNombre(t.montantBrut),
          montantCommission: enNombre(t.montantCommission),
          montantNet: enNombre(t.montantNet),
        })),
      );
    } catch (err) {
      console.error(err);
    } finally {
      setTransactionsChargees(true);
    }
  }

  async function fetchTontinesDisponibles() {
    try {
      const res = await apiFetch('/api/tontines');
      if (!res.ok) throw new Error('Erreur de chargement');
      const data: TontineDisponible[] = await res.json();
      setTontinesDisponibles(data.map((t) => ({ ...t, montantCotisation: enNombre(t.montantCotisation) })));
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchMesDemandes() {
    try {
      const res = await apiFetch('/api/member/demandes');
      if (res.ok) setDemandes((await res.json()) as DemandeAdhesion[]);
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Passage au rôle ADMIN_TONTINE après paiement unique. Le prix vient du
   * serveur ; le rôle n'est accordé qu'après confirmation du paiement.
   */
  async function devenirAdmin() {
    const prix = fraisPassageAdmin === null ? 'les frais' : formaterMontant(fraisPassageAdmin);
    if (
      !window.confirm(
        `Devenir administrateur de tontine : paiement unique de ${prix}. Le rôle sera activé après confirmation du paiement. Continuer ?`,
      )
    ) {
      return;
    }
    try {
      setDevenirAdminEnCours(true);
      setMessageErreur(null);
      const res = await apiFetch('/api/member/devenir-admin', {
        method: 'POST',
        body: JSON.stringify({ provider: providerPassageAdmin }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extraireMessageErreur(payload, 'Impossible d’initier le paiement.'));
      }

      const reference = (payload as { referenceInterne?: string }).referenceInterne;
      if (!reference) throw new Error('Référence de paiement manquante.');
      setReferencePassageAdmin(reference);
      await confirmerPassageAdmin(reference);
    } catch (err: any) {
      setMessageErreur(err.message || 'Impossible de devenir administrateur.');
    } finally {
      setDevenirAdminEnCours(false);
    }
  }

  /** Confirmation idempotente : c'est ici seulement que le serveur change le rôle. */
  async function confirmerPassageAdmin(reference: string) {
    setDevenirAdminEnCours(true);
    setMessageErreur(null);
    try {
      const res = await apiFetch('/api/member/devenir-admin/confirmer', {
        method: 'POST',
        body: JSON.stringify({ referenceInterne: reference }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(extraireMessageErreur(payload, 'Paiement non confirmé.'));

      setRoleActuel('ADMIN_TONTINE');
      const token = getToken();
      const utilisateur = getCurrentUser<Record<string, unknown>>();
      if (token && utilisateur) {
        setSession(token, { ...utilisateur, role: 'ADMIN_TONTINE' });
      }
      setReferencePassageAdmin(null);
      setMessageSucces(extraireMessageErreur(payload, 'Vous êtes désormais administrateur.'));
    } catch (err: any) {
      setMessageErreur(err.message || 'Paiement non confirmé.');
    } finally {
      setDevenirAdminEnCours(false);
    }
  }

  async function rejoindreTontine(tontineId: string) {
    try {
      setRejoindreEnCours(tontineId);
      const res = await apiFetch(`/api/tontines/${tontineId}/rejoindre`, {
        method: 'POST',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extraireMessageErreur(payload, 'Impossible d’envoyer la demande.'));
      }

      setMessageSucces(extraireMessageErreur(payload, 'Demande envoyée à l’administrateur.'));
      setTontinesDisponibles((prev) => prev.filter((t) => t.id !== tontineId));
      fetchMesTontines();
      fetchMesDemandes();
    } catch (err: any) {
      console.error(err);
      setMessageErreur(err.message || 'Impossible d’envoyer la demande.');
    } finally {
      setRejoindreEnCours(null);
    }
  }

  async function rejoindreParCode() {
    if (!codeInvitation.trim()) return;
    try {
      setRejoindreParCodeEnCours(true);
      const res = await apiFetch('/api/tontines/rejoindre-par-code', {
        method: 'POST',
        body: JSON.stringify({ codeInvitation: codeInvitation.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extraireMessageErreur(payload, 'Code d’invitation invalide.'));
      }

      setMessageSucces(extraireMessageErreur(payload, 'Demande envoyée à l’administrateur.'));
      setCodeInvitation('');
      fetchMesTontines();
      fetchTontinesDisponibles();
      fetchMesDemandes();
    } catch (err: any) {
      console.error(err);
      setMessageErreur(err.message || 'Code d’invitation invalide.');
    } finally {
      setRejoindreParCodeEnCours(false);
    }
  }

  async function creerTontine(e: FormEvent) {
    e.preventDefault();
    try {
      setCreationEnCours(true);
      const res = await apiFetch('/api/tontines', {
        method: 'POST',
        body: JSON.stringify({
          nom: formTontine.nom,
          description: formTontine.description,
          montantCotisation: Number(formTontine.montantCotisation),
          jourCotisation: formTontine.jourCotisation,
          nombreMaxMembres: Number(formTontine.nombreMaxMembres),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(extraireMessageErreur(payload, 'Impossible de créer la tontine.'));

      const data: TontineCreee = payload as TontineCreee;
      setNouvelleTontine(data);
      setModalCreationOuverte(false);
      setFormTontine({ nom: '', description: '', montantCotisation: '', jourCotisation: 'LUNDI', nombreMaxMembres: '10' });
      fetchTontinesDisponibles();
    } catch (err: any) {
      console.error(err);
      setMessageErreur(err.message || 'Impossible de créer la tontine.');
    } finally {
      setCreationEnCours(false);
    }
  }

  /** Simule le paiement d'une cotisation via Mobile Money (contrat API inchangé). */
  async function payerCotisation(cotisation: CotisationDue, provider: string) {
    setMessageErreur(null);
    try {
      setPaiementEnCours(true);
      const res = await apiFetch(`/api/member/tontines/${cotisation.tontineId}/payer`, {
        method: 'POST',
        body: JSON.stringify({ provider, cycleConcerne: cotisation.cycle }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(extraireMessageErreur(payload, 'Le paiement a échoué.'));
      }

      setMessageSucces(
        cotisation.statut === 'EN_RETARD'
          ? 'Arriéré réglé. Vous pouvez maintenant payer la cotisation suivante.'
          : 'Cotisation payée.',
      );
      fermerPaiement();
      // Rafraîchissement local : la liste se met à jour sans recharger la page.
      await fetchMesTontines();
      fetchTransactions();
    } catch (err: any) {
      console.error(err);
      setMessageErreur(err.message || 'Une erreur est survenue lors du paiement. Réessayez.');
    } finally {
      setPaiementEnCours(false);
    }
  }

  function ouvrirPaiement(cotisation: CotisationDue) {
    setMessageErreur(null);
    setCotisationEnPaiement(cotisation);
  }

  function fermerPaiement() {
    setCotisationEnPaiement(null);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-shell px-4 py-10 text-body text-muted-canvas">
        Chargement de vos tontines...
      </div>
    );
  }

  const cotisationsDues = extraireCotisationsDues(tontines);
  const cotisationUrgente = cotisationsDues[0];
  const tontineEnReception = tontines.find(
    (t) =>
      typeof t.cycleActuel === 'number' &&
      typeof t.monTour === 'number' &&
      t.cycleActuel === t.monTour,
  );
  const tontineSelectionneeObj = tontines.find((t) => t.id === tontineSelectionnee);
  const tours = tontineSelectionneeObj
    ? construireTours(tontineSelectionneeObj, detailTontine?.membres)
    : [];
  const cotisationsPayees = transactions.filter(
    (t) => t.type === 'COTISATION' && t.statut === 'REUSSIE',
  ).length;
  const montantRecu = transactions
    .filter((t) => t.type === 'RAMASSAGE' && t.statut === 'REUSSIE')
    .reduce((total, t) => total + enNombre(t.montantNet), 0);
  const paiementsEnRetard = tontines.filter(
    (t) => Boolean(t.arriere) || t.statutCotisation === 'EN_RETARD',
  ).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-greeting font-semibold text-ink">
          Bonjour {prenom || 'à vous'}
        </h1>
        <p className="mt-2 text-lead text-muted-canvas">Voici l’état de vos tontines.</p>
      </div>

      {(messageErreur || messageSucces) && (
        <Toast
          message={(messageErreur ?? messageSucces) as string}
          ton={messageErreur ? 'danger' : 'succes'}
          onFermer={() => {
            setMessageErreur(null);
            setMessageSucces(null);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-5">
          <p className="text-meta font-medium text-muted-canvas">Prochaine cotisation</p>
          {cotisationUrgente ? (
            <>
              <p className="mt-3 font-display text-tile font-semibold tabular-nums text-ink">
                {formaterMontant(cotisationUrgente.montant + cotisationUrgente.amende)}
              </p>
              <p className="mt-1 text-body text-muted-canvas">
                {cotisationUrgente.tontineNom} · {formaterDate(cotisationUrgente.dateEcheance)}
              </p>
              {cotisationUrgente.amende > 0 && (
                <p className="mt-2 text-meta text-danger">
                  Dont amende : {formaterMontant(cotisationUrgente.amende)}
                </p>
              )}
              <Link
                href="#cotisations-a-payer"
                className={buttonClasses('primary', 'mt-4 w-full')}
              >
                {cotisationsDues.length > 1
                  ? `Voir les ${cotisationsDues.length} cotisations à payer`
                  : 'Voir la cotisation à payer'}
              </Link>
            </>
          ) : (
            <p className="mt-3 text-body text-muted-canvas">Aucune cotisation à régler.</p>
          )}
        </Card>

        {tontineEnReception && (
          <AccentCard className="p-5">
            <p className="text-meta font-medium text-surface">Vous recevez la cagnotte</p>
            <p className="mt-3 font-display text-tile font-semibold">{tontineEnReception.nom}</p>
            <p className="mt-1 text-body">
              Tour {tontineEnReception.cycleActuel} · votre tour
            </p>
            <Link
              href={`/tontines/${tontineEnReception.id}`}
              className="mt-4 inline-flex min-h-control items-center rounded-pill border border-surface px-5 text-body font-semibold focus-ring"
            >
              Voir la tontine
            </Link>
          </AccentCard>
        )}
      </div>

      <CotisationsAPayer
        cotisations={cotisationsDues}
        onPayer={ouvrirPaiement}
        enCours={paiementEnCours}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile libelle="Tontines en cours" valeur={String(tontines.length)} />
        <StatTile
          libelle="Cotisations payées"
          valeur={transactionsChargees ? String(cotisationsPayees) : '...'}
          detail={transactionsChargees ? undefined : 'Chargement en cours'}
          ton="succes"
        />
        <StatTile
          libelle="Montant reçu"
          valeur={transactionsChargees ? formaterMontant(montantRecu) : '...'}
          detail="Depuis vos transactions"
        />
        <StatTile
          libelle="Paiements en retard"
          valeur={String(paiementsEnRetard)}
          detail={paiementsEnRetard > 0 ? 'À régler en priorité' : 'Rien à signaler'}
          ton={paiementsEnRetard > 0 ? 'danger' : 'neutre'}
        />
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-section font-semibold text-ink">Calendrier des tours</h2>
            <p className="mt-1 text-body text-muted-canvas">
              Suivez votre rang de passage et les tours à venir.
            </p>
          </div>
          {tontines.length > 1 && (
            <div className="sm:w-56">
              <Select
                label="Tontine"
                value={tontineSelectionnee}
                onChange={(e) => setTontineSelectionnee(e.target.value)}
                options={tontines.map((t) => ({ value: t.id, label: t.nom }))}
              />
            </div>
          )}
        </div>

        <div className="mt-5">
          {detailLoading ? (
            <p className="text-body text-muted-canvas">Chargement du calendrier...</p>
          ) : detailErreur ? (
            <div role="alert" className="rounded-card border border-danger bg-danger-surface p-4 text-body text-danger">
              {detailErreur}
            </div>
          ) : tours.length > 0 ? (
            <TourCalendar tours={tours} />
          ) : (
            <p className="text-body text-muted-canvas">Le calendrier n’est pas encore disponible.</p>
          )}
        </div>
      </Card>

      <section>
        <h2 className="font-display text-section font-semibold text-ink">Activités récentes</h2>
        <div className="mt-4">
          <DataTable
            columns={COLONNES_ACTIVITES}
            rows={transactions.slice(0, 5)}
            getRowKey={(t) => t.id}
            caption="Vos cinq dernières transactions"
            vide={
              transactionsChargees
                ? 'Aucune activité pour le moment.'
                : 'Chargement des activités...'
            }
          />
        </div>
      </section>

      <Card className="p-5">
        <h2 className="font-display text-section font-semibold text-ink">Codes d’invitation</h2>
        {tontines.filter((t) => t.codeInvitation).length === 0 ? (
          <p className="mt-2 text-body text-muted-canvas">Aucun code disponible.</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            {tontines
              .filter((t) => t.codeInvitation)
              .map((t) => (
                <div key={t.id} className="rounded-card border border-line bg-canvas p-3">
                  <p className="text-meta text-muted-canvas">{t.nom}</p>
                  <p className="mt-1 select-all text-body font-semibold tabular-nums text-ink">
                    {t.codeInvitation}
                  </p>
                </div>
              ))}
          </div>
        )}
        <div className="mt-5 border-t border-line pt-5">
          <SupportButton variante="section" />
        </div>
      </Card>

      {/* Création réservée aux ADMIN_TONTINE / SUPER_ADMIN */}
      {peutCreer && (
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-section font-semibold text-ink">Créer une tontine</h2>
              <p className="mt-1 text-body text-muted-canvas">
                Vous pouvez ouvrir une nouvelle tontine.
              </p>
            </div>
            <Button onClick={() => setModalCreationOuverte(true)}>Créer une tontine</Button>
          </div>
        </Card>
      )}

      {!peutCreer && (
        <Card className="p-5">
          <h2 className="font-display text-section font-semibold text-ink">Devenir administrateur</h2>
          <p className="mt-2 text-body text-muted-canvas">
            Seuls les administrateurs peuvent créer une tontine. Le passage coûte{' '}
            {prixPassageAdmin}, en paiement unique. Votre numéro de téléphone doit être vérifié.
          </p>
          <fieldset className="mt-4">
            <legend className="text-body font-medium text-ink">Moyen de paiement</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PROVIDERS.map((p) => (
                <Button
                  key={p.id}
                  variant={providerPassageAdmin === p.id ? 'primary' : 'secondary'}
                  aria-pressed={providerPassageAdmin === p.id}
                  onClick={() => setProviderPassageAdmin(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </fieldset>
          {referencePassageAdmin && (
            <Button
              variant="secondary"
              className="mt-4"
              disabled={devenirAdminEnCours}
              onClick={() => confirmerPassageAdmin(referencePassageAdmin)}
            >
              Confirmer le paiement ({prixPassageAdmin})
            </Button>
          )}
          <Button
            className="mt-4"
            onClick={devenirAdmin}
            disabled={devenirAdminEnCours || referencePassageAdmin !== null}
          >
            {devenirAdminEnCours
              ? 'Patientez...'
              : referencePassageAdmin
                ? 'Paiement en attente de confirmation'
                : `Devenir Admin — ${prixPassageAdmin}`}
          </Button>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="font-display text-section font-semibold text-ink">Demander à rejoindre</h2>
        <p className="mt-1 text-body text-muted-canvas">
          L’administrateur doit accepter votre demande avant votre entrée dans la tontine.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            rejoindreParCode();
          }}
        >
          <div className="flex-1">
            <Input
              label="Code d’invitation"
              value={codeInvitation}
              onChange={(e) => setCodeInvitation(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="A1B2C3D4"
            />
          </div>
          <Button type="submit" disabled={!codeInvitation.trim() || rejoindreParCodeEnCours}>
            {rejoindreParCodeEnCours ? 'Envoi...' : 'Demander'}
          </Button>
        </form>
      </Card>

      {demandes.length > 0 && (
        <Card className="p-5">
          <h2 className="font-display text-section font-semibold text-ink">Mes demandes d’adhésion</h2>
          <div className="mt-4 space-y-3">
            {demandes.map((d) => (
              <div key={d.id} className="rounded-card border border-line bg-canvas p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium text-ink">{d.tontine.nom}</p>
                  <StatutBadge statut={d.statut} />
                </div>
                <p className="mt-1 text-meta text-muted-canvas">
                  Demandée le {formaterDate(d.createdAt)}
                  {d.statut === 'EN_ATTENTE' ? ' · en attente de validation' : ''}
                </p>
                {d.motifRefus && <p className="mt-2 text-meta text-danger">Motif : {d.motifRefus}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="font-display text-section font-semibold text-ink">Tontines disponibles</h2>
        {tontinesDisponibles.length === 0 ? (
          <Card className="p-5 text-body text-muted-canvas">
            Aucune tontine n’attend de nouveaux membres.
          </Card>
        ) : (
          tontinesDisponibles.map((t) => (
            <Card key={t.id} className="p-5">
              <h3 className="font-display text-lead font-semibold text-ink">{t.nom}</h3>
              {t.description && <p className="mt-1 text-body text-muted-canvas">{t.description}</p>}
              <dl className="mt-4 space-y-2 text-body">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-canvas">Cotisation</dt>
                  <dd className="tabular-nums font-semibold">{formaterMontant(t.montantCotisation)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-canvas">Membres</dt>
                  <dd className="tabular-nums font-semibold">
                    {t._count.membres}/{t.nombreMaxMembres}
                  </dd>
                </div>
              </dl>
              {t.createurId === utilisateurConnecteId ? (
                <p className="mt-4 text-body font-medium text-ink">
                  Vous êtes membre créateur de cette tontine.
                </p>
              ) : (
                <Button
                  className="mt-4 w-full"
                  onClick={() => rejoindreTontine(t.id)}
                  disabled={rejoindreEnCours === t.id}
                >
                  {rejoindreEnCours === t.id ? 'Envoi...' : 'Demander à rejoindre'}
                </Button>
              )}
            </Card>
          ))
        )}
      </section>

      {/* Paiement : récapitulatif lisible, deux étapes maximum. */}
      <PaymentModal
        ouvert={cotisationEnPaiement !== null}
        onFermer={fermerPaiement}
        tontineNom={cotisationEnPaiement?.tontineNom}
        montantCotisation={cotisationEnPaiement?.montant ?? 0}
        amende={cotisationEnPaiement?.amende ?? 0}
        total={
          cotisationEnPaiement
            ? cotisationEnPaiement.montant + cotisationEnPaiement.amende
            : 0
        }
        cycleConcerne={cotisationEnPaiement?.cycle ?? null}
        enCours={paiementEnCours}
        onConfirmer={(provider) => {
          if (cotisationEnPaiement) void payerCotisation(cotisationEnPaiement, provider);
        }}
      />

      <Modal
        ouvert={modalCreationOuverte}
        onFermer={() => setModalCreationOuverte(false)}
        titre="Créer une tontine"
      >
        <form onSubmit={creerTontine} className="space-y-4">
          <Input
            label="Nom de la tontine"
            required
            value={formTontine.nom}
            onChange={(e) => setFormTontine({ ...formTontine, nom: e.target.value })}
          />
          <Textarea
            label="Description"
            rows={2}
            value={formTontine.description}
            onChange={(e) => setFormTontine({ ...formTontine, description: e.target.value })}
          />
          <Input
            label="Montant de la cotisation (F)"
            type="number"
            required
            min={100}
            value={formTontine.montantCotisation}
            onChange={(e) => setFormTontine({ ...formTontine, montantCotisation: e.target.value })}
          />
          <Select
            label="Jour de cotisation"
            value={formTontine.jourCotisation}
            onChange={(e) =>
              setFormTontine({ ...formTontine, jourCotisation: e.target.value as JourSemaine })
            }
            options={JOURS_SEMAINE.map((jour) => ({
              value: jour,
              label: LIBELLES_JOURS[jour].charAt(0).toUpperCase() + LIBELLES_JOURS[jour].slice(1),
            }))}
            aide={`Une cotisation chaque ${LIBELLES_JOURS[formTontine.jourCotisation]}.`}
          />
          <Input
            label="Nombre maximum de membres"
            type="number"
            required
            min={2}
            max={50}
            value={formTontine.nombreMaxMembres}
            onChange={(e) => setFormTontine({ ...formTontine, nombreMaxMembres: e.target.value })}
            aide={texteDuree(formTontine.nombreMaxMembres, formTontine.jourCotisation)}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setModalCreationOuverte(false)}
            >
              Annuler
            </Button>
            <Button type="submit" className="flex-1" disabled={creationEnCours}>
              {creationEnCours ? 'Création en cours...' : 'Créer'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        ouvert={nouvelleTontine !== null}
        onFermer={() => setNouvelleTontine(null)}
        titre="Tontine créée"
      >
        {nouvelleTontine && (
          <div className="space-y-4">
            <p className="text-body text-muted-canvas">
              Partagez ce code avec les personnes à inviter :
            </p>
            <p className="select-all rounded-card border border-line bg-canvas p-4 text-center font-display text-tile font-semibold tracking-wider text-ink">
              {nouvelleTontine.codeInvitation}
            </p>
            <p className="break-all text-meta text-muted-canvas">
              Lien d’invitation :{' '}
              <Link
                href={`/join/${nouvelleTontine.codeInvitation}`}
                className="rounded-pill font-semibold text-ink underline focus-ring"
              >
                /join/{nouvelleTontine.codeInvitation}
              </Link>
            </p>
            <Button className="w-full" onClick={() => setNouvelleTontine(null)}>
              Fermer
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
