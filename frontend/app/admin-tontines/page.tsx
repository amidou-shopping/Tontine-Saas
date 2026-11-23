'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getProfilServeur, enNombre, clearSession } from '@/lib/api';

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
  _count: { membres: number };
}

export default function AdminTontinesPage() {
  const router = useRouter();
  const [tontines, setTontines] = useState<TontineAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalCreationOuverte, setModalCreationOuverte] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [nouvelleTontine, setNouvelleTontine] = useState<{ id: string; nom: string; codeInvitation: string } | null>(null);
  const [formTontine, setFormTontine] = useState({
    nom: '',
    description: '',
    montantCotisation: '',
    frequence: 'MENSUELLE',
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
      chargerTontines();
    }
    verifierAcces();
  }, []);

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
          frequence: formTontine.frequence,
          nombreMaxMembres: Number(formTontine.nombreMaxMembres),
        }),
      });
      if (!res.ok) throw new Error('Erreur lors de la création');

      const data = await res.json();
      setNouvelleTontine(data);
      setModalCreationOuverte(false);
      setFormTontine({ nom: '', description: '', montantCotisation: '', frequence: 'MENSUELLE', nombreMaxMembres: '10' });
      chargerTontines();
    } catch (err) {
      console.error(err);
      alert('Impossible de créer la tontine.');
    } finally {
      setCreationEnCours(false);
    }
  }

  async function demarrerTontine(id: string) {
    if (!confirm('Voulez-vous vraiment démarrer cette tontine ? Tous les membres devront cotiser à chaque cycle.')) return;
    try {
      const res = await apiFetch(`/api/tontines/${id}/demarrer`, { method: 'POST' });
      if (!res.ok) throw new Error('Erreur');
      alert('Tontine démarrée !');
      chargerTontines();
    } catch (err) {
      console.error(err);
      alert('Impossible de démarrer la tontine.');
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Fréquence *</label>
                <select
                  value={formTontine.frequence}
                  onChange={(e) => setFormTontine({ ...formTontine, frequence: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="QUOTIDIENNE">Quotidienne</option>
                  <option value="HEBDOMADAIRE">Hebdomadaire</option>
                  <option value="MENSUELLE">Mensuelle</option>
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
          <div key={t.id} className="rounded-2xl border border-gray-200 shadow-sm p-4 bg-white space-y-3">
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

            {t.statut === 'EN_ATTENTE' && t._count.membres >= t.nombreMaxMembres && (
              <button
                onClick={() => demarrerTontine(t.id)}
                className="w-full rounded-xl bg-green-600 text-white py-2 text-sm font-semibold hover:bg-green-700"
              >
                Démarrer la tontine
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
