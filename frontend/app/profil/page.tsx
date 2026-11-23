'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getCurrentUser, clearSession, enNombre } from '@/lib/api';

interface Profil {
  id: string;
  email: string;
  telephone: string;
  nom: string;
  prenom: string;
  role: string;
  isVerified: boolean;
  avatarUrl: string | null;
  createdAt: string;
  abonnement: {
    plan: string;
    prixMensuel: number;
    actif: boolean;
  } | null;
}

export default function ProfilPage() {
  const router = useRouter();
  const [profil, setProfil] = useState<Profil | null>(null);
  const [loading, setLoading] = useState(true);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [form, setForm] = useState({ nom: '', prenom: '', telephone: '' });

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    chargerProfil();
  }, []);

  async function chargerProfil() {
    try {
      setLoading(true);
      const res = await apiFetch('/api/member/profil');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Erreur de chargement');
      const data: Profil = await res.json();
      // prixMensuel est un Decimal sérialisé en chaîne par Prisma.
      const profilRecu: Profil = {
        ...data,
        abonnement: data.abonnement
          ? { ...data.abonnement, prixMensuel: enNombre(data.abonnement.prixMensuel) }
          : null,
      };
      setProfil(profilRecu);
      setForm({ nom: profilRecu.nom, prenom: profilRecu.prenom, telephone: profilRecu.telephone });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function sauvegarder(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSauvegarde(true);
      const res = await apiFetch('/api/member/profil', {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Erreur de sauvegarde');
      alert('Profil mis à jour avec succès !');
      chargerProfil();
    } catch (err) {
      console.error(err);
      alert('Impossible de mettre à jour le profil.');
    } finally {
      setSauvegarde(false);
    }
  }

  function deconnexion() {
    clearSession();
    router.push('/login');
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Chargement...</div>;
  if (!profil) return <div className="p-8 text-center text-red-600">Profil introuvable.</div>;

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Mon profil</h1>
        <button onClick={deconnexion} className="text-sm text-gray-500 underline">
          Déconnexion
        </button>
      </div>

      {/* Carte d'identité */}
      <div className="rounded-2xl border border-gray-200 shadow-sm p-4 bg-white space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 text-xl font-bold">
            {profil.prenom[0]}{profil.nom[0]}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{profil.prenom} {profil.nom}</p>
            <p className="text-xs text-gray-500">{profil.email}</p>
            <span className="inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {profil.role}
            </span>
          </div>
        </div>
        <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
          <span className="text-gray-500">Téléphone</span>
          <span className="font-medium text-gray-900">{profil.telephone}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Vérifié</span>
          <span className={`font-medium ${profil.isVerified ? 'text-green-600' : 'text-red-600'}`}>
            {profil.isVerified ? 'Oui' : 'Non'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Membre depuis</span>
          <span className="font-medium text-gray-900">
            {new Date(profil.createdAt).toLocaleDateString('fr-FR')}
          </span>
        </div>
      </div>

      {/* Formulaire de modification */}
      <form onSubmit={sauvegarder} className="rounded-2xl border border-gray-200 shadow-sm p-4 bg-white space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Modifier mes informations</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Prénom</label>
            <input
              value={form.prenom}
              onChange={(e) => setForm({ ...form, prenom: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nom</label>
            <input
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
          <input
            value={form.telephone}
            onChange={(e) => setForm({ ...form, telephone: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="+221771234567"
          />
        </div>
        <button
          type="submit"
          disabled={sauvegarde}
          className="w-full rounded-xl bg-sky-600 text-white py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          {sauvegarde ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </form>

      {/* Abonnement */}
      <div className="rounded-2xl border border-gray-200 shadow-sm p-4 bg-white space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Mon abonnement</h2>
        {profil.abonnement ? (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Plan</span>
              <span className="font-medium text-gray-900">{profil.abonnement.plan}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Prix mensuel</span>
              <span className="font-medium text-gray-900">
                {profil.abonnement.prixMensuel.toLocaleString('fr-FR')} FCFA
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Statut</span>
              <span className={`font-medium ${profil.abonnement.actif ? 'text-green-600' : 'text-red-600'}`}>
                {profil.abonnement.actif ? 'Actif' : 'Inactif'}
              </span>
            </div>
          </>
        ) : (
          <p className="text-gray-500 text-sm">Aucun abonnement actif.</p>
        )}
      </div>
    </div>
  );
}
