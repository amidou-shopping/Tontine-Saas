'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, enNombre, extraireMessageErreur } from '@/lib/api';

interface TransactionMembre {
  id: string;
  type: string;
  statut: string;
  montantBrut: number;
  montantCommission: number;
  montantNet: number;
  provider: string | null;
  cycleConcerne: number | null;
  createdAt: string;
  tontine?: { nom?: string } | null;
  tontineNom?: string | null;
  [cle: string]: unknown;
}

const LIBELLES_TYPE: Record<string, string> = {
  COTISATION: 'Cotisation',
  RAMASSAGE: 'Ramassage',
  RETRAIT: 'Retrait',
  COMMISSION: 'Commission',
  REMBOURSEMENT: 'Remboursement',
};

function libelleType(type: string) {
  return LIBELLES_TYPE[type] ?? type;
}

function nomTontine(transaction: TransactionMembre) {
  return transaction.tontine?.nom ?? transaction.tontineNom ?? 'Tontine inconnue';
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionMembre[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    let actif = true;

    async function chargerTransactions() {
      setLoading(true);
      setErreur(null);
      try {
        const res = await apiFetch('/api/member/transactions');
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!actif) return;
          setErreur(extraireMessageErreur(data, 'Impossible de charger vos transactions.'));
          return;
        }

        const payload = (await res.json().catch(() => ({}))) ?? {};
        const liste: unknown = Array.isArray(payload) ? payload : payload.data ?? [];
        if (!actif) return;

        // Les montants Prisma (Decimal) arrivent sous forme de chaînes JSON.
        setTransactions(
          (Array.isArray(liste) ? (liste as TransactionMembre[]) : []).map((t) => ({
            ...t,
            montantBrut: enNombre(t.montantBrut),
            montantCommission: enNombre(t.montantCommission),
            montantNet: enNombre(t.montantNet),
          })),
        );
      } catch (err) {
        console.error(err);
        if (actif) setErreur('Une erreur est survenue. Réessayez.');
      } finally {
        if (actif) setLoading(false);
      }
    }

    chargerTransactions();
    return () => {
      actif = false;
    };
  }, [tentative]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Mes transactions</h1>
        <Link href="/dashboard" className="text-sm text-gray-500 underline">
          Retour
        </Link>
      </div>

      {loading && <p className="text-center text-gray-500 py-8">Chargement des transactions...</p>}

      {erreur && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 space-y-3">
          <p>{erreur}</p>
          <button
            onClick={() => setTentative((n) => n + 1)}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Réessayer
          </button>
        </div>
      )}

      {!loading && !erreur && transactions.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Aucune transaction pour le moment. Vos cotisations apparaîtront ici.
        </div>
      )}

      {!loading && !erreur && transactions.length > 0 && (
        <div className="space-y-3">
          {transactions.map((t) => (
            <div key={t.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-2">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{libelleType(t.type)}</p>
                  <p className="text-xs text-gray-500">{nomTontine(t)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900 text-sm">
                    {t.montantNet.toLocaleString('fr-FR')} FCFA
                  </p>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      t.statut === 'REUSSIE'
                        ? 'bg-green-100 text-green-700'
                        : t.statut === 'EN_ATTENTE'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {t.statut}
                  </span>
                </div>
              </div>

              <div className="flex justify-between border-t border-gray-100 pt-2 text-xs text-gray-500">
                <span>
                  {new Date(t.createdAt).toLocaleDateString('fr-FR')}
                  {t.cycleConcerne ? ` · Cycle ${t.cycleConcerne}` : ''}
                  {t.provider ? ` · ${t.provider}` : ''}
                </span>
                <span>
                  Brut : {t.montantBrut.toLocaleString('fr-FR')} · Commission :{' '}
                  {t.montantCommission.toLocaleString('fr-FR')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
