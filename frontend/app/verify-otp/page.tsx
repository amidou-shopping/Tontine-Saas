'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  apiFetch,
  extraireMessageErreur,
  getOtpUserId,
  setOtpUserId,
  clearOtpUserId,
} from '@/lib/api';

function VerifyOtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userIdUrl = searchParams.get('userId');
  const emailUrl = searchParams.get('email');
  // L'ID est stocké à l'inscription : le renvoi fonctionne même si on revient
  // plus tard sur cette page sans le paramètre dans l'URL. On le lit dans un
  // effet pour garder un rendu serveur/client identique (hydration).
  const [userId, setUserId] = useState(userIdUrl ?? '');
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [renvoiEnCours, setRenvoiEnCours] = useState(false);
  const [attenteAvantRenvoi, setAttenteAvantRenvoi] = useState(0);

  useEffect(() => {
    if (userIdUrl) {
      setOtpUserId(userIdUrl);
      setUserId(userIdUrl);
      return;
    }
    const idEnregistre = getOtpUserId();
    if (idEnregistre) setUserId(idEnregistre);
  }, [userIdUrl]);

  useEffect(() => {
    if (attenteAvantRenvoi <= 0) return;
    const timer = setTimeout(() => setAttenteAvantRenvoi((secondes) => secondes - 1), 1000);
    return () => clearTimeout(timer);
  }, [attenteAvantRenvoi]);

  async function renvoyerCode() {
    if (!userId) {
      setErreur('Identifiant de vérification introuvable. Veuillez vous inscrire à nouveau.');
      return;
    }
    setErreur(null);
    setMessage(null);
    setRenvoiEnCours(true);
    try {
      const res = await apiFetch('/api/auth/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setAttenteAvantRenvoi(60);
        setErreur(
          extraireMessageErreur(
            data,
            'Trop de demandes. Veuillez patienter avant de réessayer.',
          ),
        );
        return;
      }
      if (!res.ok) {
        setErreur(extraireMessageErreur(data, 'Impossible de renvoyer le code.'));
        return;
      }
      setMessage('Un nouveau code a été envoyé à votre adresse email (logs du serveur en développement).');
    } catch (err) {
      console.error(err);
      setErreur('Une erreur est survenue. Réessayez.');
    } finally {
      setRenvoiEnCours(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setMessage(null);
    setChargement(true);
    try {
      const res = await apiFetch('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ userId, code }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErreur(extraireMessageErreur(data, 'Code invalide.'));
        return;
      }

      clearOtpUserId();
      router.push('/login');
    } catch (err) {
      console.error(err);
      setErreur('Une erreur est survenue. Réessayez.');
    } finally {
      setChargement(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
      <h1 className="text-xl font-bold text-gray-900">Vérification de l'email</h1>
      <p className="text-sm text-gray-500">
        Un code à 6 chiffres a été envoyé à l'adresse email utilisée lors de l'inscription.
        En développement, il est affiché dans les logs du serveur backend (console).
      </p>
      {emailUrl && (
        <p className="text-sm text-gray-700">
          Code envoyé à <strong>{emailUrl}</strong>
        </p>
      )}

      {erreur && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">{erreur}</div>
      )}
      {message && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm p-3">{message}</div>
      )}

      <div className="space-y-1">
        <label className="text-sm text-gray-600">Code à 6 chiffres</label>
        <input
          required
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm tracking-widest text-center text-lg"
          placeholder="000000"
        />
      </div>

      <button type="submit" disabled={chargement} className="w-full rounded-xl bg-gray-900 text-white py-2.5 text-sm font-semibold disabled:opacity-40">
        {chargement ? 'Vérification...' : 'Vérifier'}
      </button>

      <button
        type="button"
        onClick={renvoyerCode}
        disabled={renvoiEnCours || attenteAvantRenvoi > 0}
        className="w-full rounded-xl border border-gray-300 text-gray-700 py-2.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40"
      >
        {renvoiEnCours
          ? 'Envoi...'
          : attenteAvantRenvoi > 0
            ? `Renvoyer le code dans ${attenteAvantRenvoi}s`
            : 'Renvoyer le code'}
      </button>
    </form>
  );
}

export default function VerifyOtpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-gray-500">Chargement...</div>}>
        <VerifyOtpForm />
      </Suspense>
    </div>
  );
}
