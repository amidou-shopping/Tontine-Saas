'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, extraireMessageErreur, setSession } from '@/lib/api';
import AuthCard from '@/components/ui/AuthCard';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setChargement(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErreur(
          extraireMessageErreur(
            data,
            'Identifiants incorrects. Vérifiez votre email et votre mot de passe.',
          ),
        );
        return;
      }

      setSession(data.accessToken, data.user);
      router.push(data.user.role === 'SUPER_ADMIN' ? '/admin/dashboard' : '/dashboard');
    } catch (err) {
      console.error(err);
      setErreur('Connexion impossible. Vérifiez votre connexion internet, puis réessayez.');
    } finally {
      setChargement(false);
    }
  }

  return (
    <AuthCard
      titre="Connexion"
      description="Retrouvez vos tontines et vos échéances."
      lien={
        <>
          Pas encore de compte ?{' '}
          <Link href="/register" className="rounded-pill font-semibold text-ink underline focus-ring">
            Créer un compte
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

        <Input
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Input
          label="Mot de passe"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" disabled={chargement} className="w-full">
          {chargement ? 'Connexion en cours...' : 'Se connecter'}
        </Button>
      </form>
    </AuthCard>
  );
}
