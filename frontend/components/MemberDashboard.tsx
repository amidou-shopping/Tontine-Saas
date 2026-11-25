/**
 * MemberDashboard.tsx
 * ----------------------------------------------------------------------------
 * Tableau de bord d'un membre : vue de ses tontines en cours, sa prochaine
 * échéance, son tour de ramassage, et un bouton pour simuler le paiement
 * de sa cotisation via Mobile Money.
 *
 * Mobile-first, Tailwind CSS, App Router (Next.js 14+).
 * ----------------------------------------------------------------------------
 */

'use client';

import { useState, useEffect } from 'react';
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
import { JOURS_SEMAINE, LIBELLES_JOURS, texteDuree, type JourSemaine } from '@/lib/jours-semaine';

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
  montantCotisation: number;
  frequence: 'QUOTIDIENNE' | 'HEBDOMADAIRE' | 'MENSUELLE';
  prochainEcheance: string; // ISO date
  monTour: number;          // Rang de passage du membre
  cycleActuel: number;      // Tour en cours dans la tontine
  statutCotisation: 'PAYE' | 'EN_ATTENTE' | 'EN_RETARD' | 'ARRIERE';
  arriere?: Arriere | null;
  codeInvitation?: string;
}

const PROVIDERS = [
  { id: 'WAVE', label: 'Wave', couleur: 'bg-sky-500' },
  { id: 'ORANGE_MONEY', label: 'Orange Money', couleur: 'bg-orange-500' },
] as const;

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

export default function MemberDashboard({ role }: { role: string }) {
  const router = useRouter();
  const [tontines, setTontines] = useState<TontineResume[]>([]);
  const [tontinesDisponibles, setTontinesDisponibles] = useState<TontineDisponible[]>([]);
  const [loading, setLoading] = useState(true);
  const [tontineEnPaiement, setTontineEnPaiement] = useState<string | null>(null);
  const [providerChoisi, setProviderChoisi] = useState<string | null>(null);
  const [paiementEnCours, setPaiementEnCours] = useState(false);
  const [cycleEnPaiement, setCycleEnPaiement] = useState<number | null>(null);
  const [messageSucces, setMessageSucces] = useState<string | null>(null);
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const [rejoindreEnCours, setRejoindreEnCours] = useState<string | null>(null);
  const [roleActuel, setRoleActuel] = useState(role);
  const [devenirAdminEnCours, setDevenirAdminEnCours] = useState(false);
  const [fraisPassageAdmin, setFraisPassageAdmin] = useState<number | null>(null);
  const [providerPassageAdmin, setProviderPassageAdmin] = useState('WAVE');
  const [referencePassageAdmin, setReferencePassageAdmin] = useState<string | null>(null);
  const [demandes, setDemandes] = useState<DemandeAdhesion[]>([]);

  const peutCreer = roleActuel === 'ADMIN_TONTINE' || roleActuel === 'SUPER_ADMIN';
  // Le créateur est membre d'office : on ne lui propose pas de demander à
  // rejoindre sa propre tontine (le serveur refuse aussi toutes les voies).
  const utilisateurConnecteId = getCurrentUser<{ id: string }>()?.id;
  const prixPassageAdmin =
    fraisPassageAdmin === null
      ? '...'
      : `${fraisPassageAdmin.toLocaleString('fr-FR')} F`;

  // États pour la création de tontine
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

  // États pour le code d'invitation
  const [codeInvitation, setCodeInvitation] = useState('');
  const [rejoindreParCodeEnCours, setRejoindreParCodeEnCours] = useState(false);

  useEffect(() => {
    fetchMesTontines();
    fetchTontinesDisponibles();
    fetchMesDemandes();
    fetchTarifPassageAdmin();
  }, []);

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
      // Les Decimal de Prisma arrivent en JSON sous forme de chaînes.
      setTontines(data.map((t) => ({ ...t, montantCotisation: enNombre(t.montantCotisation) })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
    const prix = fraisPassageAdmin === null ? 'les frais' : `${fraisPassageAdmin} F`;
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

  async function creerTontine(e: React.FormEvent) {
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

  /**
   * Simule le paiement d'une cotisation via Mobile Money.
   * En production, cet appel déclenche côté backend l'initialisation du
   * paiement auprès du provider (Wave/Orange Money) puis attend le webhook
   * de confirmation. Ici on simule directement une réponse REUSSIE.
   */
  async function payerCotisation(tontineId: string) {
    if (!providerChoisi) return;
    setMessageErreur(null);
    try {
      setPaiementEnCours(true);
      const res = await apiFetch(`/api/member/tontines/${tontineId}/payer`, {
        method: 'POST',
        body: JSON.stringify({
          provider: providerChoisi,
          ...(cycleEnPaiement ? { cycleConcerne: cycleEnPaiement } : {}),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(extraireMessageErreur(payload, 'Le paiement a échoué.'));
      }

      setMessageSucces(
        cycleEnPaiement
          ? 'Arriéré réglé. Vous pouvez maintenant payer le tour en cours.'
          : 'Cotisation payée avec succès !',
      );
      setTontineEnPaiement(null);
      setCycleEnPaiement(null);
      setProviderChoisi(null);
      fetchMesTontines(); // Rafraîchit l'état des échéances et l'arriéré
    } catch (err: any) {
      console.error(err);
      setMessageErreur(err.message || 'Une erreur est survenue lors du paiement. Réessayez.');
    } finally {
      setPaiementEnCours(false);
    }
  }

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Chargement de vos tontines...</div>;
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Mes tontines</h1>

      {messageSucces && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm p-3">
          {messageSucces}
        </div>
      )}

      {messageErreur && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3"
        >
          {messageErreur}
        </div>
      )}

      {/* Création réservée aux ADMIN_TONTINE / SUPER_ADMIN */}
      {peutCreer ? (
        <button
          onClick={() => setModalCreationOuverte(true)}
          className="w-full rounded-xl bg-sky-600 text-white py-3 text-sm font-semibold hover:bg-sky-700 transition"
        >
          + Créer une tontine
        </button>
      ) : (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-sky-900">Vous êtes membre</p>
          <p className="text-xs text-sky-800">
            Seuls les administrateurs peuvent créer une tontine. Le passage au rôle Admin coûte{' '}
            <strong>{prixPassageAdmin}</strong> (paiement unique, non remboursable). Votre numéro de
            téléphone doit être vérifié. Vous pouvez aussi demander à rejoindre une tontine
            existante.
          </p>
          <div className="flex gap-2" aria-label="Moyen de paiement">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProviderPassageAdmin(p.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  providerPassageAdmin === p.id
                    ? 'border-sky-600 bg-white text-sky-700'
                    : 'border-sky-200 text-sky-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {referencePassageAdmin && (
            <button
              type="button"
              onClick={() => confirmerPassageAdmin(referencePassageAdmin)}
              disabled={devenirAdminEnCours}
              className="w-full rounded-xl border border-sky-600 bg-white text-sky-700 py-2.5 text-sm font-semibold hover:bg-sky-100 disabled:opacity-40"
            >
              Confirmer le paiement ({prixPassageAdmin})
            </button>
          )}
          <button
            onClick={devenirAdmin}
            disabled={devenirAdminEnCours || referencePassageAdmin !== null}
            className="w-full rounded-xl bg-sky-600 text-white py-2.5 text-sm font-semibold hover:bg-sky-700 disabled:opacity-40"
          >
            {devenirAdminEnCours
              ? 'Patientez...'
              : referencePassageAdmin
                ? 'Paiement en attente de confirmation'
                : `Devenir Admin — ${prixPassageAdmin}`}
          </button>
        </div>
      )}

      {/* Modal de création de tontine */}
      {peutCreer && modalCreationOuverte && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Créer une tontine</h2>
            <form onSubmit={creerTontine} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                <input
                  type="text"
                  required
                  value={formTontine.nom}
                  onChange={(e) => setFormTontine({ ...formTontine, nom: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="Ex: Tontine des Amies"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea
                  value={formTontine.description}
                  onChange={(e) => setFormTontine({ ...formTontine, description: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  rows={2}
                  placeholder="Objectif de la tontine..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Montant cotisation (FCFA) *</label>
                <input
                  type="number"
                  required
                  min="100"
                  value={formTontine.montantCotisation}
                  onChange={(e) => setFormTontine({ ...formTontine, montantCotisation: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="Ex: 10000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Jour de cotisation *</label>
                <select
                  value={formTontine.jourCotisation}
                  onChange={(e) =>
                    setFormTontine({ ...formTontine, jourCotisation: e.target.value as JourSemaine })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {JOURS_SEMAINE.map((jour) => (
                    <option key={jour} value={jour}>
                      {LIBELLES_JOURS[jour][0].toUpperCase() + LIBELLES_JOURS[jour].slice(1)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-500">
                  Une cotisation chaque semaine, le {LIBELLES_JOURS[formTontine.jourCotisation]}.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre max de membres *</label>
                <input
                  type="number"
                  required
                  min="2"
                  max="50"
                  value={formTontine.nombreMaxMembres}
                  onChange={(e) => setFormTontine({ ...formTontine, nombreMaxMembres: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="mt-1 text-[11px] text-sky-700">
                  {texteDuree(formTontine.nombreMaxMembres, formTontine.jourCotisation)}
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalCreationOuverte(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creationEnCours}
                  className="flex-1 rounded-lg bg-sky-600 text-white py-2 text-sm font-semibold hover:bg-sky-700 disabled:opacity-40"
                >
                  {creationEnCours ? 'Création...' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmation avec code d'invitation */}
      {nouvelleTontine && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 text-center">
            <div className="text-4xl">🎉</div>
            <h2 className="text-lg font-bold text-gray-900">Tontine créée !</h2>
            <p className="text-sm text-gray-600">
              Partage ce code d'invitation avec tes amis pour qu'ils rejoignent ta tontine :
            </p>
            <div className="bg-gray-100 rounded-xl py-4 px-6">
              <p className="text-2xl font-mono font-bold text-sky-600 tracking-wider">
                {nouvelleTontine.codeInvitation}
              </p>
            </div>
            <p className="text-xs text-gray-400">
              Lien d’invitation :{' '}
              <Link
                href={`/join/${nouvelleTontine.codeInvitation}`}
                className="text-sky-600 underline break-all"
              >
                /join/{nouvelleTontine.codeInvitation}
              </Link>
            </p>
            <button
              onClick={() => setNouvelleTontine(null)}
              className="w-full rounded-lg bg-sky-600 text-white py-2.5 text-sm font-semibold hover:bg-sky-700"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Section : demander à rejoindre via code d'invitation */}
      <div className="rounded-2xl border border-gray-200 shadow-sm p-4 bg-white space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Demander à rejoindre via un code
        </h2>
        <p className="text-xs text-gray-500">
          L’administrateur de la tontine doit accepter votre demande avant votre entrée effective.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={codeInvitation}
            onChange={(e) => setCodeInvitation(e.target.value.toUpperCase())}
            placeholder="Ex: A1B2C3D4"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-sky-500"
            maxLength={8}
          />
          <button
            onClick={rejoindreParCode}
            disabled={!codeInvitation.trim() || rejoindreParCodeEnCours}
            className="rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {rejoindreParCodeEnCours ? '...' : 'Demander'}
          </button>
        </div>
      </div>

      {/* Suivi des demandes envoyées */}
      {demandes.length > 0 && (
        <div className="rounded-2xl border border-gray-200 shadow-sm p-4 bg-white space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Mes demandes d’adhésion</h2>
          {demandes.map((d) => (
            <div key={d.id} className="rounded-xl border border-gray-100 p-3 space-y-1">
              <div className="flex justify-between items-start gap-2">
                <p className="text-sm font-medium text-gray-900">{d.tontine.nom}</p>
                <span
                  className={`text-[11px] font-medium px-2 py-1 rounded-full ${
                    d.statut === 'ACCEPTEE'
                      ? 'bg-green-100 text-green-700'
                      : d.statut === 'REFUSEE'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {d.statut === 'EN_ATTENTE'
                    ? 'En attente'
                    : d.statut === 'ACCEPTEE'
                      ? 'Acceptée'
                      : 'Refusée'}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Demandée le {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                {d.statut === 'EN_ATTENTE' && ' · en attente de validation par l’administrateur'}
              </p>
              {d.motifRefus && (
                <p className="text-xs text-red-600">Motif : {d.motifRefus}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {tontines.length === 0 && (
        <p className="text-gray-500 text-sm">Vous ne participez à aucune tontine pour le moment.</p>
      )}

      {tontines.map((t) => (
        <div
          key={t.id}
          role="button"
          tabIndex={0}
          aria-label={`Voir le détail de la tontine ${t.nom}`}
          onClick={() => router.push(`/tontines/${t.id}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              router.push(`/tontines/${t.id}`);
            }
          }}
          className="rounded-2xl border border-gray-200 shadow-sm p-4 bg-white space-y-3 cursor-pointer hover:border-sky-300 hover:shadow-md transition"
        >
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-semibold text-gray-900">{t.nom}</h2>
              <p className="text-xs text-gray-500">
                Cycle {t.cycleActuel} · Votre tour : #{t.monTour}
              </p>
            </div>
            <StatutBadge statut={t.statutCotisation} />
          </div>

          {t.arriere && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 space-y-1">
              <p className="font-semibold">Impayé : tour {t.arriere.cycle}</p>
              <p>
                {t.arriere.montantTotal.toLocaleString('fr-FR')} FCFA à régler
                {t.arriere.amende > 0
                  ? ` (cotisation + ${t.arriere.amende.toLocaleString('fr-FR')} FCFA d'amende)`
                  : ' (aucune amende pendant le délai de grâce)'}
                .
              </p>
              <p>Vous devez régler cet arriéré avant de payer le tour {t.cycleActuel}.</p>
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Cotisation</span>
            <span className="font-medium text-gray-900">
              {t.montantCotisation.toLocaleString('fr-FR')} FCFA
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Prochaine échéance</span>
            <span className="font-medium text-gray-900">
              {new Date(t.prochainEcheance).toLocaleDateString('fr-FR')}
            </span>
          </div>

          <p className="text-xs text-sky-600 font-medium">Voir le détail →</p>

          {t.codeInvitation && (
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-500">Code d'invitation</p>
              <p className="text-sm font-mono font-bold text-sky-600">{t.codeInvitation}</p>
            </div>
          )}

          {(t.statutCotisation !== 'PAYE' || Boolean(t.arriere)) && (
            <>
              {tontineEnPaiement === t.id ? (
                <div
                  className="space-y-2 pt-2 border-t border-gray-100"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <p className="text-xs text-gray-500">Choisissez votre moyen de paiement :</p>
                  <p className="text-xs font-medium text-gray-800">
                    Montant :{' '}
                    {(t.arriere?.montantTotal ?? t.montantCotisation).toLocaleString('fr-FR')} FCFA
                  </p>
                  <div className="flex gap-2">
                    {PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setProviderChoisi(p.id)}
                        className={`flex-1 rounded-xl py-2 text-sm font-medium text-white transition ${p.couleur} ${
                          providerChoisi === p.id ? 'ring-2 ring-offset-2 ring-gray-800' : 'opacity-80'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <button
                    disabled={!providerChoisi || paiementEnCours}
                    onClick={() => payerCotisation(t.id)}
                    className="w-full rounded-xl bg-gray-900 text-white py-2.5 text-sm font-semibold disabled:opacity-40"
                  >
                    {paiementEnCours ? 'Traitement...' : 'Confirmer le paiement'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setTontineEnPaiement(t.id);
                    setCycleEnPaiement(t.arriere?.cycle ?? null);
                  }}
                  className="w-full rounded-xl bg-gray-900 text-white py-2.5 text-sm font-semibold"
                >
                  {t.arriere
                    ? `Régler l'arriéré (${t.arriere.montantTotal.toLocaleString('fr-FR')} FCFA)`
                    : 'Payer ma cotisation'}
                </button>
              )}
            </>
          )}
        </div>
      ))}

      {/* Section : Découvrir les tontines disponibles */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Tontines disponibles</h2>
        {tontinesDisponibles.length === 0 && (
          <p className="text-gray-400 text-sm">Aucune tontine en attente de membres.</p>
        )}
        {tontinesDisponibles.map((t) => (
          <div key={t.id} className="rounded-2xl border border-gray-200 shadow-sm p-4 bg-white space-y-2">
            <h3 className="font-semibold text-gray-900">{t.nom}</h3>
            {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Cotisation</span>
              <span className="font-medium text-gray-900">
                {t.montantCotisation.toLocaleString('fr-FR')} FCFA / {t.frequence.toLowerCase()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Membres</span>
              <span className="font-medium text-gray-900">
                {t._count.membres}/{t.nombreMaxMembres}
              </span>
            </div>
            {t.createurId === utilisateurConnecteId ? (
              <p className="text-xs font-medium text-sky-700">
                Vous êtes membre créateur de cette tontine.
              </p>
            ) : (
              <button
                onClick={() => rejoindreTontine(t.id)}
                disabled={rejoindreEnCours === t.id}
                className="w-full rounded-xl bg-gray-900 text-white py-2 text-sm font-semibold disabled:opacity-40"
              >
                {rejoindreEnCours === t.id ? 'Envoi...' : 'Demander à rejoindre'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatutBadge({ statut }: { statut: TontineResume['statutCotisation'] }) {
  const styles: Record<typeof statut, string> = {
    PAYE: 'bg-green-100 text-green-700',
    EN_ATTENTE: 'bg-yellow-100 text-yellow-700',
    EN_RETARD: 'bg-red-100 text-red-700',
    ARRIERE: 'bg-red-100 text-red-700',
  };
  const labels: Record<typeof statut, string> = {
    PAYE: 'Payé',
    EN_ATTENTE: 'En attente',
    EN_RETARD: 'En retard',
    ARRIERE: 'Arriéré',
  };
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${styles[statut]}`}>
      {labels[statut]}
    </span>
  );
}
