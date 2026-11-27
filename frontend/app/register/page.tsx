'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, extraireMessageErreur, setOtpUserId } from '@/lib/api';
import AuthCard from '@/components/ui/AuthCard';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', telephone: '', password: '' });
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  function update(champ: keyof typeof form, valeur: string) {
    setForm((f) => ({ ...f, [champ]: valeur }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setChargement(true);
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setErreur(extraireMessageErreur(data, 'Inscription impossible. Vérifiez les champs indiqués.'));
        return;
      }

      // Conservé pour permettre le renvoi du code depuis la page de vérification.
      setOtpUserId(data.userId);
      router.push(`/verify-otp?userId=${data.userId}&email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      console.error(err);
      setErreur('Inscription impossible. Vérifiez votre connexion internet, puis réessayez.');
    } finally {
      setChargement(false);
    }
  }

  return (
    <AuthCard
      titre="Créer un compte"
      description="Quelques informations suffisent pour commencer."
      lien={
        <>
          Vous avez déjà un compte ?{' '}
          <Link href="/login" className="rounded-pill font-semibold text-ink underline focus-ring">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {erreur && (
          <div role="alert" className="rounded-card border border-danger bg-danger-surface p-4 text-meta text-danger">
            {erreur}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Prénom"
            required
            autoComplete="given-name"
            value={form.prenom}
            onChange={(e) => update('prenom', e.target.value)}
          />
          <Input
            label="Nom"
            required
            autoComplete="family-name"
            value={form.nom}
            onChange={(e) => update('nom', e.target.value)}
          />
        </div>

        <Input
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
        />

        <Input
          label="Téléphone"
          type="tel"
          required
          autoComplete="tel"
          value={form.telephone}
          onChange={(e) => update('telephone', e.target.value)}
        />

        <Input
          label="Mot de passe"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          aide="8 caractères minimum."
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
        />

        <Button type="submit" disabled={chargement} className="w-full">
          {chargement ? 'Création en cours...' : 'Créer mon compte'}
        </Button>
      </form>
    </AuthCard>
  );
}
