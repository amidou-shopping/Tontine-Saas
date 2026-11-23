'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, setSession } from '@/lib/api';

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
        setErreur(data.message ?? 'Identifiants invalides.');
        return;
      }

      setSession(data.accessToken, data.user);
      router.push(data.user.role === 'SUPER_ADMIN' ? '/admin/dashboard' : '/dashboard');
    } catch (err) {
      console.error(err);
      setErreur('Une erreur est survenue. Réessayez.');
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">Connexion</h1>

        {erreur && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">{erreur}</div>
        )}

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder="vous@exemple.com"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Mot de passe</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={chargement}
          className="w-full rounded-xl bg-gray-900 text-white py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          {chargement ? 'Connexion...' : 'Se connecter'}
        </button>

        <p className="text-center text-sm text-gray-500">
          Pas encore de compte ?{' '}
          <Link href="/register" className="text-gray-900 font-medium underline">
            Créer un compte
          </Link>
        </p>
      </form>
    </div>
  );
}
