'use client';

import { useState, useEffect, type FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  apiFetch,
  extraireMessageErreur,
  getOtpUserId,
  setOtpUserId,
  clearOtpUserId,
} from '@/lib/api';
import AuthCard from '@/components/ui/AuthCard';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

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
            'Trop de demandes. Patientez avant de demander un nouveau code.',
          ),
        );
        return;
      }
      if (!res.ok) {
        setErreur(
          `${extraireMessageErreur(data, 'Impossible de renvoyer le code.')} Réessayez.`,
        );
        return;
      }
      setMessage('Un nouveau code a été envoyé à votre adresse email.');
    } catch (err) {
      console.error(err);
      setErreur('Envoi impossible. Vérifiez votre connexion internet, puis réessayez.');
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
        setErreur(
          `${extraireMessageErreur(data, 'Code invalide.')} Vérifiez le code reçu ou demandez-en un nouveau.`,
        );
        return;
      }

      clearOtpUserId();
      router.push('/login');
    } catch (err) {
      console.error(err);
      setErreur('Vérification impossible. Vérifiez votre connexion internet, puis réessayez.');
    } finally {
      setChargement(false);
    }
  }

  return (
    <AuthCard
      titre="Vérifiez votre email"
      description="Étape 2 sur 2 : saisissez le code à 6 chiffres envoyé par email."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {emailUrl && (
          <p className="text-body text-muted-canvas">
            Code envoyé à <span className="font-semibold text-ink">{emailUrl}</span>
          </p>
        )}

        {erreur && (
          <div role="alert" className="rounded-card border border-danger bg-danger-surface p-4 text-meta text-danger">
            {erreur}
          </div>
        )}
        {message && (
          <div role="status" className="rounded-card border border-success bg-success-surface p-4 text-meta text-success">
            {message}
          </div>
        )}

        <Input
          label="Code à 6 chiffres"
          required
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="one-time-code"
          className="text-center text-lead tracking-widest tabular-nums"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />

        <Button type="submit" disabled={chargement} className="w-full">
          {chargement ? 'Vérification en cours...' : 'Vérifier le code'}
        </Button>

        <Button
          variant="secondary"
          type="button"
          onClick={renvoyerCode}
          disabled={renvoiEnCours || attenteAvantRenvoi > 0}
          className="w-full"
        >
          {renvoiEnCours
            ? 'Envoi en cours...'
            : attenteAvantRenvoi > 0
              ? `Renvoyer le code dans ${attenteAvantRenvoi} s`
              : 'Renvoyer le code'}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-body text-muted-canvas">Chargement...</p>}>
      <VerifyOtpForm />
    </Suspense>
  );
}
