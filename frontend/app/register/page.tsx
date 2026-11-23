'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, extraireMessageErreur, setOtpUserId } from '@/lib/api';

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
        setErreur(extraireMessageErreur(data, 'Inscription impossible.'));
        return;
      }

      // Conservé pour permettre le renvoi du code depuis la page de vérification.
      setOtpUserId(data.userId);
      router.push(`/verify-otp?userId=${data.userId}&email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      console.error(err);
      setErreur('Une erreur est survenue. Réessayez.');
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">Créer un compte</h1>

        {erreur && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">{erreur}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Prénom</label>
            <input required value={form.prenom} onChange={(e) => update('prenom', e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-600">Nom</label>
            <input required value={form.nom} onChange={(e) => update('nom', e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Email</label>
          <input type="email" required value={form.email} onChange={(e) => update('email', e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="vous@exemple.com" />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Téléphone</label>
          <input required value={form.telephone} onChange={(e) => update('telephone', e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="+221771234567" />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Mot de passe</label>
          <input type="password" required minLength={8} value={form.password} onChange={(e) => update('password', e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="8 caractères minimum" />
        </div>

        <button type="submit" disabled={chargement} className="w-full rounded-xl bg-gray-900 text-white py-2.5 text-sm font-semibold disabled:opacity-40">
          {chargement ? 'Création...' : 'Créer mon compte'}
        </button>
      </form>
    </div>
  );
}
