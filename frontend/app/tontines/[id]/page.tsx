'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiFetch, getCurrentUser, enNombre } from '@/lib/api';
import { LIBELLES_JOURS, type JourSemaine } from '@/lib/jours-semaine';

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

export default function TontineDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [tontine, setTontine] = useState<DetailTontine | null>(null);
  const [loading, setLoading] = useState(true);
  const [onglet, setOnglet] = useState<'membres' | 'transactions'>('membres');

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    chargerDetail();
  }, [id]);

  async function chargerDetail() {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/member/tontines/${id}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Erreur de chargement');
      const data: DetailTontine = await res.json();
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
      alert('Impossible de charger le détail de la tontine.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Chargement...</div>;
  if (!tontine) return <div className="p-8 text-center text-red-600">Tontine introuvable.</div>;

  const utilisateur = getCurrentUser<{ id: string }>();
  const monStatut = tontine.membres.find((m) => m.user.id === utilisateur?.id)?.statut;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <button
        onClick={() => router.push('/dashboard')}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        ← Retour
      </button>

      {/* Phase 3 : un membre exclu est prévenu du remboursement à la clôture. */}
      {monStatut === 'EXCLU' && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <p className="font-semibold">Vous avez été exclu de cette tontine.</p>
          <p className="mt-1 text-xs">
            Les cotisations et amendes déjà réglées vous seront remboursées à la clôture de la
            tontine. Vous ne pouvez plus effectuer de paiement ici.
          </p>
        </div>
      )}

      {/* En-tête */}
      <div className="rounded-2xl border border-gray-200 shadow-sm p-4 bg-white space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{tontine.nom}</h1>
            {tontine.description && (
              <p className="text-sm text-gray-500 mt-1">{tontine.description}</p>
            )}
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            tontine.statut === 'ACTIVE' ? 'bg-green-100 text-green-700' :
            tontine.statut === 'EN_ATTENTE' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {tontine.statut}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-500">Cotisation</p>
            <p className="font-semibold text-gray-900">
              {tontine.montantCotisation.toLocaleString('fr-FR')} FCFA
            </p>
          </div>
          <div>
            <p className="text-gray-500">Jour de cotisation</p>
            <p className="font-semibold text-gray-900">
              {LIBELLES_JOURS[tontine.jourCotisation]?.[0].toUpperCase()}
              {LIBELLES_JOURS[tontine.jourCotisation]?.slice(1) ?? tontine.jourCotisation}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Cycle actuel</p>
            <p className="font-semibold text-gray-900">{tontine.cycleActuel}</p>
          </div>
          <div>
            <p className="text-gray-500">Membres</p>
            <p className="font-semibold text-gray-900">
              {tontine.membres.length}/{tontine.nombreMaxMembres}
            </p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Code d'invitation</p>
          <p className="text-lg font-mono font-bold text-sky-600">{tontine.codeInvitation}</p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2">
        <button
          onClick={() => setOnglet('membres')}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
            onglet === 'membres' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Membres ({tontine.membres.length})
        </button>
        <button
          onClick={() => setOnglet('transactions')}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
            onglet === 'transactions' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Transactions ({tontine.transactions.length})
        </button>
      </div>

      {/* Contenu des onglets */}
      {onglet === 'membres' && (
        <div className="space-y-2">
          {tontine.membres.map((m) => (
            <div key={m.id} className="rounded-xl border border-gray-200 p-3 bg-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 font-bold text-sm">
                  {m.user.prenom[0]}{m.user.nom[0]}
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{m.user.prenom} {m.user.nom}</p>
                  <p className="text-xs text-gray-500">
                     Tour #{m.ordrePassage} · ordre tiré au sort au démarrage
                   </p>
                </div>
              </div>
              <div className="text-right">
                {m.statut === 'EXCLU' ? (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-100 text-red-700">
                    Exclu — remboursé à la clôture
                  </span>
                ) : m.aDejaRecu ? (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">
                    A reçu
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                    {m.statut}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {onglet === 'transactions' && (
        <div className="space-y-2">
          {tontine.transactions.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-4">Aucune transaction pour le moment.</p>
          )}
          {tontine.transactions.map((t) => (
            <div key={t.id} className="rounded-xl border border-gray-200 p-3 bg-white">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{t.type}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(t.createdAt).toLocaleDateString('fr-FR')}
                    {t.cycleConcerne && ` · Cycle ${t.cycleConcerne}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900 text-sm">
                    {t.montantBrut.toLocaleString('fr-FR')} FCFA
                  </p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    t.statut === 'REUSSIE' ? 'bg-green-100 text-green-700' :
                    t.statut === 'EN_ATTENTE' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {t.statut}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
