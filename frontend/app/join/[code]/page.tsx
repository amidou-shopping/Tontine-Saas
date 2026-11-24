'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, extraireMessageErreur } from '@/lib/api';

/**
 * Page d'invitation : un membre suit /join/CODE et envoie une demande
 * d'adhésion à l'administrateur de la tontine. L'entrée effective n'a lieu
 * qu'après acceptation de cette demande.
 */
export default function JoinPage() {
  const params = useParams();
  const code = (params.code as string) ?? '';
  const router = useRouter();

  const [etat, setEtat] = useState<'chargement' | 'succes' | 'erreur'>('chargement');
  const [message, setMessage] = useState<string | null>(null);
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    let actif = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function rejoindre() {
      setEtat('chargement');
      setMessage(null);

      if (!code) {
        setEtat('erreur');
        setMessage('Code d’invitation manquant.');
        return;
      }

      try {
        const res = await apiFetch('/api/tontines/rejoindre-par-code', {
          method: 'POST',
          body: JSON.stringify({ codeInvitation: code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!actif) return;

        if (!res.ok) {
          setEtat('erreur');
          setMessage(extraireMessageErreur(data, 'Impossible d’envoyer la demande.'));
          return;
        }

        setEtat('succes');
        setMessage(
          extraireMessageErreur(data, 'Demande envoyée à l’administrateur de la tontine.') +
            ' Redirection vers votre tableau de bord...',
        );
        timer = setTimeout(() => router.push('/dashboard'), 1500);
      } catch (err) {
        console.error(err);
        if (!actif) return;
        setEtat('erreur');
        setMessage('Une erreur est survenue. Réessayez.');
      }
    }

    rejoindre();
    return () => {
      actif = false;
      if (timer) clearTimeout(timer);
    };
  }, [code, router, tentative]);

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-center space-y-4">
        <div className="text-4xl">
          {etat === 'chargement' ? '⏳' : etat === 'succes' ? '🎉' : '⚠️'}
        </div>
        <h1 className="text-xl font-bold text-gray-900">Invitation à une tontine</h1>

        <div className="rounded-xl bg-gray-50 py-3">
          <p className="text-xs text-gray-500">Code d’invitation</p>
          <p className="text-lg font-mono font-bold text-sky-600 tracking-wider">{code || '—'}</p>
        </div>

        {etat === 'chargement' && (
          <p className="text-sm text-gray-500">Envoi de votre demande d’adhésion...</p>
        )}

        {message && etat === 'succes' && (
          <p className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
            {message}
          </p>
        )}

        {message && etat === 'erreur' && (
          <p className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {message}
          </p>
        )}

        {etat === 'erreur' && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setTentative((n) => n + 1)}
              className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Réessayer
            </button>
            <Link href="/dashboard" className="text-sm text-gray-500 underline">
              Retour à mon tableau de bord
            </Link>
          </div>
        )}

        {etat === 'succes' && (
          <Link href="/dashboard" className="inline-block text-sm text-sky-600 underline">
            Aller à mon tableau de bord
          </Link>
        )}
      </div>
    </div>
  );
}
