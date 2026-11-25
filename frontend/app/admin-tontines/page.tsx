'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  apiFetch,
  getProfilServeur,
  enNombre,
  clearSession,
  extraireMessageErreur,
} from '@/lib/api';
import { JOURS_SEMAINE, LIBELLES_JOURS, texteDuree, type JourSemaine } from '@/lib/jours-semaine';

interface DemandeEnAttente {
  id: string;
  statut: string;
  createdAt: string;
  user: { id: string; nom: string; prenom: string; email: string };
}

interface DemandeDetail {
  id: string;
  statut: string;
  traiteeAt: string | null;
  motifRefus: string | null;
  dejaTraitee: boolean;
  message: string;
  user: { id: string; nom: string; prenom: string; email: string };
  tontine: { id: string; nom: string };
}

interface MembreAdmin {
  id: string;
  ordrePassage: number;
  statut: string;
  user: { id: string; nom: string; prenom: string; email: string };
}

interface TontineAdmin {
  id: string;
  nom: string;
  description: string | null;
  montantCotisation: number;
  frequence: string;
  nombreMaxMembres: number;
  statut: string;
  cycleActuel: number;
  codeInvitation: string;
  dateDebut: string | null;
  createurId: string;
  demandesAdhesion: DemandeEnAttente[];
  membres: MembreAdmin[];
  _count: { membres: number; demandesAdhesion?: number };
}

export default function AdminTontinesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Chargement...</div>}>
      <AdminTontinesContenu />
    </Suspense>
  );
}

function AdminTontinesContenu() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tontineCibleId = searchParams.get('tontineId');
  const demandeCibleId = searchParams.get('demandeId');
  const [tontines, setTontines] = useState<TontineAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalCreationOuverte, setModalCreationOuverte] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);
  const [demandeCible, setDemandeCible] = useState<DemandeDetail | null>(null);
  const [messageDemande, setMessageDemande] = useState<string | null>(null);
  const [nouvelleTontine, setNouvelleTontine] = useState<{ id: string; nom: string; codeInvitation: string } | null>(null);
  const [formTontine, setFormTontine] = useState({
    nom: '',
    description: '',
    montantCotisation: '',
    jourCotisation: 'LUNDI' as JourSemaine,
    nombreMaxMembres: '10',
  });

  useEffect(() => {
    async function verifierAcces() {
      // Le rôle autorisé vient du serveur, pas de localStorage.
      const profil = await getProfilServeur<{ role: string }>();
      if (!profil) {
        router.push('/login');
        return;
      }
      if (profil.role !== 'ADMIN_TONTINE' && profil.role !== 'SUPER_ADMIN') {
        router.push('/dashboard');
        return;
      }
      await chargerTontines();
      await chargerDemandeCible();
    }
    verifierAcces();
  }, [demandeCibleId]);

  async function chargerTontines() {
    try {
      setLoading(true);
      const res = await apiFetch('/api/tontines/admin/mes-tontines');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Erreur de chargement');
      const data: TontineAdmin[] = await res.json();
      setTontines(data.map((t) => ({ ...t, montantCotisation: enNombre(t.montantCotisation) })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  /** Ouvre la demande ciblée par le lien reçu par notification. */
  async function chargerDemandeCible() {
    if (!demandeCibleId) return;
    try {
      const res = await apiFetch(`/api/tontines/demandes/${demandeCibleId}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessageDemande(extraireMessageErreur(payload, 'Impossible d’ouvrir cette demande.'));
        return;
      }
      const detail = payload as DemandeDetail;
      setDemandeCible(detail);
      if (detail.dejaTraitee) setMessageDemande(detail.message);
    } catch (err) {
      console.error(err);
      setMessageDemande('Impossible d’ouvrir cette demande.');
    }
  }

  useEffect(() => {
    if (!demandeCible || demandeCible.dejaTraitee) return;
    document
      .getElementById(`demande-${demandeCible.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [demandeCible, tontines]);

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
      if (!res.ok) throw new Error('Erreur lors de la création');

      const data = await res.json();
      setNouvelleTontine(data);
      setModalCreationOuverte(false);
      setFormTontine({ nom: '', description: '', montantCotisation: '', jourCotisation: 'LUNDI', nombreMaxMembres: '10' });
      chargerTontines();
    } catch (err) {
      console.error(err);
      alert('Impossible de créer la tontine.');
    } finally {
      setCreationEnCours(false);
    }
  }

  async function demarrerTontine(id: string) {
    if (!confirm('Voulez-vous vraiment démarrer cette tontine ? L’ordre de passage sera tiré au sort et tous les membres devront cotiser chaque semaine.')) return;
    try {
      setActionEnCours(id);
      const res = await apiFetch(`/api/tontines/${id}/demarrer`, { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(extraireMessageErreur(payload, 'Impossible de démarrer la tontine.'));
      alert('Tontine démarrée ! L’ordre de passage a été tiré au sort.');
      chargerTontines();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Impossible de démarrer la tontine.');
    } finally {
      setActionEnCours(null);
    }
  }

  /** Accepter ou refuser une demande d'adhésion. */
  async function traiterDemande(demandeId: string, accepter: boolean) {
    try {
      setActionEnCours(demandeId);
      const motifRefus = accepter
        ? undefined
        : prompt('Motif du refus (facultatif) :') ?? undefined;
      const res = await apiFetch(
        `/api/tontines/demandes/${demandeId}/${accepter ? 'accepter' : 'refuser'}`,
        {
          method: 'POST',
          ...(accepter ? {} : { body: JSON.stringify({ motifRefus }) }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(extraireMessageErreur(payload, 'Impossible de traiter la demande.'));
      alert(extraireMessageErreur(payload, accepter ? 'Demande acceptée.' : 'Demande refusée.'));
      chargerTontines();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Impossible de traiter la demande.');
    } finally {
      setActionEnCours(null);
    }
  }

  /** Exclut un membre ; le net réglé est remboursé à la clôture. */
  async function exclureMembre(tontineId: string, userId: string, nom: string) {
    if (!confirm(`Exclure ${nom} de cette tontine ? Les sommes réglées lui seront remboursées à la clôture.`)) return;
    try {
      setActionEnCours(userId);
      const res = await apiFetch(`/api/tontines/${tontineId}/membres/${userId}/exclure`, {
        method: 'POST',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(extraireMessageErreur(payload, 'Impossible d’exclure le membre.'));
      alert(extraireMessageErreur(payload, 'Membre exclu.'));
      chargerTontines();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Impossible d’exclure le membre.');
    } finally {
      setActionEnCours(null);
    }
  }

  function deconnexion() {
    clearSession();
    router.push('/login');
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Chargement...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Gestion des tontines</h1>
        <button onClick={deconnexion} className="text-sm text-gray-500 underline">
          Déconnexion
        </button>
      </div>

      {messageDemande && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            demandeCible?.dejaTraitee
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <p className="font-semibold">
            {demandeCible?.dejaTraitee
              ? `Demande ${demandeCible.statut.toLowerCase()} — ${demandeCible.user.prenom} ${demandeCible.user.nom}`
              : 'Demande indisponible'}
          </p>
          <p className="mt-1">{messageDemande}</p>
          {demandeCible?.motifRefus && (
            <p className="mt-1 text-xs">Motif du refus : {demandeCible.motifRefus}</p>
          )}
        </div>
      )}

      <button
        onClick={() => setModalCreationOuverte(true)}
        className="w-full rounded-xl bg-sky-600 text-white py-3 text-sm font-semibold hover:bg-sky-700 transition"
      >
        + Créer une tontine
      </button>

      {/* Modal de création */}
      {modalCreationOuverte && (
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea
                  value={formTontine.description}
                  onChange={(e) => setFormTontine({ ...formTontine, description: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  rows={2}
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Jour de cotisation *</label>
                <select
                  value={formTontine.jourCotisation}
                  onChange={(e) =>
                    setFormTontine({ ...formTontine, jourCotisation: e.target.value as JourSemaine })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {JOURS_SEMAINE.map((jour) => (
                    <option key={jour} value={jour}>
                      {LIBELLES_JOURS[jour][0].toUpperCase() + LIBELLES_JOURS[jour].slice(1)}
                    </option>
                  ))}
                </select>
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-sky-700">
                  {texteDuree(formTontine.nombreMaxMembres, formTontine.jourCotisation)}
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalCreationOuverte(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creationEnCours}
                  className="flex-1 rounded-lg bg-sky-600 text-white py-2 text-sm font-semibold disabled:opacity-40"
                >
                  {creationEnCours ? 'Création...' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmation */}
      {nouvelleTontine && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 text-center">
            <div className="text-4xl">🎉</div>
            <h2 className="text-lg font-bold text-gray-900">Tontine créée !</h2>
            <p className="text-sm text-gray-600">
              Partage ce code d'invitation avec tes amis :
            </p>
            <div className="bg-gray-100 rounded-xl py-4 px-6">
              <p className="text-2xl font-mono font-bold text-sky-600 tracking-wider">
                {nouvelleTontine.codeInvitation}
              </p>
            </div>
            <button
              onClick={() => setNouvelleTontine(null)}
              className="w-full rounded-lg bg-sky-600 text-white py-2.5 text-sm font-semibold"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Liste des tontines */}
      <div className="space-y-3">
        {tontines.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Aucune tontine créée.</p>
        )}
        {tontines.map((t) => (
          <div
            key={t.id}
            id={`tontine-${t.id}`}
            className={`rounded-2xl border shadow-sm p-4 bg-white space-y-3 ${
              demandeCible && !demandeCible.dejaTraitee && t.id === demandeCible.tontine.id
                ? 'border-sky-300 ring-2 ring-sky-400'
                : 'border-gray-200'
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-gray-900">{t.nom}</h3>
                {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                t.statut === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                t.statut === 'EN_ATTENTE' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {t.statut}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-gray-500 text-xs">Cotisation</p>
                <p className="font-medium text-gray-900">{t.montantCotisation.toLocaleString('fr-FR')}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Membres</p>
                <p className="font-medium text-gray-900">{t._count.membres}/{t.nombreMaxMembres}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Cycle</p>
                <p className="font-medium text-gray-900">{t.cycleActuel}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-500">Code d'invitation</p>
              <p className="text-sm font-mono font-bold text-sky-600">{t.codeInvitation}</p>
            </div>

            {/* Demandes d'adhésion à traiter */}
            {(t.demandesAdhesion ?? []).length > 0 && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900">
                  Demandes en attente ({t.demandesAdhesion.length})
                </p>
                {t.demandesAdhesion.map((d) => (
                  <div
                    key={d.id}
                    id={`demande-${d.id}`}
                    className={`rounded-lg bg-white border p-2 space-y-2 ${
                      demandeCibleId === d.id && !demandeCible?.dejaTraitee
                        ? 'border-sky-300 ring-2 ring-sky-400'
                        : 'border-amber-100'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {d.user.prenom} {d.user.nom}
                      </p>
                      <p className="text-[11px] text-gray-500">{d.user.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => traiterDemande(d.id, true)}
                        disabled={actionEnCours === d.id}
                        className="flex-1 rounded-lg bg-green-600 text-white py-1.5 text-xs font-semibold disabled:opacity-40"
                      >
                        Accepter
                      </button>
                      <button
                        onClick={() => traiterDemande(d.id, false)}
                        disabled={actionEnCours === d.id}
                        className="flex-1 rounded-lg border border-red-200 text-red-700 py-1.5 text-xs font-semibold disabled:opacity-40"
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Membres et exclusion */}
            {(t.membres ?? []).length > 0 && (
              <div className="space-y-1 rounded-xl border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-700">Membres</p>
                {t.membres.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 text-xs py-1"
                  >
                    <span className="text-gray-700">
                      #{m.ordrePassage} · {m.user.prenom} {m.user.nom}
                      {m.statut !== 'ACTIF' && ` (${m.statut})`}
                    </span>
                    {m.user.id !== t.createurId && m.statut !== 'EXCLU' && (
                      <button
                        onClick={() =>
                          exclureMembre(
                            t.id,
                            m.user.id,
                            `${m.user.prenom} ${m.user.nom}`,
                          )
                        }
                        disabled={actionEnCours === m.user.id}
                        className="text-[11px] text-red-600 underline disabled:opacity-40"
                      >
                        Exclure
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {t.statut === 'EN_ATTENTE' && t._count.membres >= t.nombreMaxMembres && (
              <button
                onClick={() => demarrerTontine(t.id)}
                disabled={actionEnCours === t.id}
                className="w-full rounded-xl bg-green-600 text-white py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-40"
              >
                Démarrer la tontine (tirage au sort)
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
