'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  apiFetch,
  extraireMessageErreur,
  getCurrentUser,
  clearSession,
  enNombre,
} from '@/lib/api';

interface Abonnement {
  id: string;
  plan: string;
  prixMensuel: number;
  dateDebut: string;
  dateFin: string | null;
  actif: boolean;
  enEssai: boolean;
}

interface Grille {
  prixStandardFcfa: number;
  prixPremiumFcfa: number;
  limiteTontinesGratuites: number;
  limiteTontinesStandard: number;
  dureeEssaiJours: number;
  dureeAbonnementJours: number;
}

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
  abonnement: Abonnement | null;
}

export default function ProfilPage() {
  const router = useRouter();
  const [profil, setProfil] = useState<Profil | null>(null);
  const [loading, setLoading] = useState(true);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [form, setForm] = useState({ nom: '', prenom: '', telephone: '' });
  const [grille, setGrille] = useState<Grille | null>(null);
  const [actionAbonnement, setActionAbonnement] = useState(false);
  const [messageAbonnement, setMessageAbonnement] = useState<{
    texte: string;
    erreur: boolean;
  } | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    chargerProfil();
    chargerGrille();
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

  async function chargerGrille() {
    try {
      const res = await apiFetch('/api/subscriptions/plans');
      if (res.ok) setGrille((await res.json()) as Grille);
    } catch (err) {
      console.error(err);
    }
  }

  /** Les règles (essai, prix, limites) sont vérifiées côté serveur. */
  async function changerPlan(plan: 'STANDARD' | 'PREMIUM') {
    if (
      !confirm(
        `Passer au plan ${plan} ? Le premier plan payant démarre par une période d’essai gratuite ; le paiement est simulé dans cette version.`,
      )
    )
      return;

    setActionAbonnement(true);
    setMessageAbonnement(null);
    try {
      const res = await apiFetch('/api/subscriptions/changer-plan', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(extraireMessageErreur(payload, 'Changement de plan impossible.'));
      setMessageAbonnement({ texte: `Plan ${plan} activé.`, erreur: false });
      await chargerProfil();
    } catch (err: any) {
      setMessageAbonnement({
        texte: err.message || 'Changement de plan impossible.',
        erreur: true,
      });
    } finally {
      setActionAbonnement(false);
    }
  }

  async function renouveler() {
    setActionAbonnement(true);
    setMessageAbonnement(null);
    try {
      const res = await apiFetch('/api/subscriptions/renouveler', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(extraireMessageErreur(payload, 'Renouvellement impossible.'));
      setMessageAbonnement({ texte: 'Abonnement renouvelé.', erreur: false });
      await chargerProfil();
    } catch (err: any) {
      setMessageAbonnement({
        texte: err.message || 'Renouvellement impossible.',
        erreur: true,
      });
    } finally {
      setActionAbonnement(false);
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

  const abonnement = profil?.abonnement ?? null;
  const peutGererAbonnement =
    profil?.role === 'ADMIN_TONTINE' || profil?.role === 'SUPER_ADMIN';

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

      {/* Abonnement (Phase 6) */}
      <div className="rounded-2xl border border-gray-200 shadow-sm p-4 bg-white space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Mon abonnement</h2>

        {messageAbonnement && (
          <p
            className={`text-xs ${messageAbonnement.erreur ? 'text-red-600' : 'text-green-600'}`}
          >
            {messageAbonnement.texte}
          </p>
        )}

        {abonnement ? (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Plan</span>
              <span className="font-medium text-gray-900">{abonnement.plan}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Prix du plan</span>
              <span className="font-medium text-gray-900">
                {abonnement.prixMensuel.toLocaleString('fr-FR')} FCFA
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Statut</span>
              <span
                className={`font-medium ${
                  abonnement.actif
                    ? abonnement.enEssai
                      ? 'text-sky-600'
                      : 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {!abonnement.actif
                  ? 'Expiré'
                  : abonnement.enEssai
                    ? 'Période d’essai gratuite'
                    : 'Actif'}
              </span>
            </div>
            {abonnement.dateFin && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Échéance</span>
                <span className="font-medium text-gray-900">
                  {new Date(abonnement.dateFin).toLocaleDateString('fr-FR')}
                </span>
              </div>
            )}
            {abonnement.plan !== 'GRATUIT' && !abonnement.actif && (
              <button
                onClick={renouveler}
                disabled={actionAbonnement}
                className="w-full rounded-xl bg-amber-600 text-white py-2 text-xs font-semibold disabled:opacity-40"
              >
                {actionAbonnement ? '...' : 'Renouveler mon abonnement'}
              </button>
            )}
          </>
        ) : (
          <p className="text-gray-500 text-sm">Aucun abonnement enregistré.</p>
        )}

        {/* La grille affichée vient de la configuration serveur, jamais du code client. */}
        {peutGererAbonnement && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600">Choisir un plan</p>
            {grille ? (
              <ul className="text-xs text-gray-600 space-y-1">
                <li>
                  GRATUIT — {grille.limiteTontinesGratuites} tontine
                  {grille.limiteTontinesGratuites > 1 ? 's' : ''}
                </li>
                <li>
                  STANDARD — {grille.prixStandardFcfa.toLocaleString('fr-FR')} FCFA /{' '}
                  {grille.dureeAbonnementJours} jours — {grille.limiteTontinesStandard} tontines
                </li>
                <li>
                  PREMIUM — {grille.prixPremiumFcfa.toLocaleString('fr-FR')} FCFA /{' '}
                  {grille.dureeAbonnementJours} jours — illimité
                </li>
                <li>Essai gratuit : {grille.dureeEssaiJours} jours (une seule fois).</li>
              </ul>
            ) : (
              <p className="text-xs text-gray-500">Grille indisponible pour le moment.</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => changerPlan('STANDARD')}
                disabled={actionAbonnement}
                className="flex-1 rounded-xl border border-sky-200 text-sky-700 py-2 text-xs font-semibold disabled:opacity-40"
              >
                STANDARD
              </button>
              <button
                onClick={() => changerPlan('PREMIUM')}
                disabled={actionAbonnement}
                className="flex-1 rounded-xl bg-sky-600 text-white py-2 text-xs font-semibold disabled:opacity-40"
              >
                PREMIUM
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
