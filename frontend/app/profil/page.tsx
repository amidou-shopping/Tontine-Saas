'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  apiFetch,
  extraireMessageErreur,
  getCurrentUser,
  getToken,
  setSession,
  enNombre,
} from '@/lib/api';
import { formaterDateComplete, formaterMontant, libelleRole } from '@/lib/affichage';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Toast from '@/components/ui/Toast';
import NotificationsSection from '@/components/NotificationsSection';
import SupportButton from '@/components/SupportButton';

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
  codeAdhesion?: string | null;
  abonnement: Abonnement | null;
}

const PROVIDERS = [
  { id: 'WAVE', label: 'Wave' },
  { id: 'ORANGE_MONEY', label: 'Orange Money' },
] as const;

type TonToast = 'succes' | 'danger';

export default function ProfilPage() {
  const router = useRouter();
  const [profil, setProfil] = useState<Profil | null>(null);
  const [loading, setLoading] = useState(true);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [form, setForm] = useState({ nom: '', prenom: '', telephone: '' });
  const [grille, setGrille] = useState<Grille | null>(null);
  const [actionAbonnement, setActionAbonnement] = useState(false);
  const [planAChanger, setPlanAChanger] = useState<'STANDARD' | 'PREMIUM' | null>(null);
  const [toast, setToast] = useState<{ message: string; ton: TonToast } | null>(null);
  const [fraisPassageAdmin, setFraisPassageAdmin] = useState<number | null>(null);
  const [providerPassageAdmin, setProviderPassageAdmin] = useState<string>('WAVE');
  const [confirmationPassageOuverte, setConfirmationPassageOuverte] = useState(false);
  const [referencePassageAdmin, setReferencePassageAdmin] = useState<string | null>(null);
  const [devenirAdminEnCours, setDevenirAdminEnCours] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    void chargerProfil();
    void chargerGrille();
    void chargerTarifPassageAdmin();
  }, []);

  async function chargerProfil() {
    try {
      setLoading(true);
      const res = await apiFetch('/api/member/profil');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          extraireMessageErreur(payload, 'Impossible de charger votre profil. Réessayez.'),
        );
      }
      const data = payload as Profil;
      const profilRecu: Profil = {
        ...data,
        abonnement: data.abonnement
          ? { ...data.abonnement, prixMensuel: enNombre(data.abonnement.prixMensuel) }
          : null,
      };
      setProfil(profilRecu);
      setForm({ nom: profilRecu.nom, prenom: profilRecu.prenom, telephone: profilRecu.telephone });
    } catch (err: any) {
      console.error(err);
      setToast({
        message: err.message || 'Impossible de charger votre profil. Réessayez.',
        ton: 'danger',
      });
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

  async function chargerTarifPassageAdmin() {
    try {
      const res = await apiFetch('/api/member/devenir-admin/tarif');
      if (res.ok) {
        const payload = (await res.json()) as { fraisPassageAdminFcfa: number };
        setFraisPassageAdmin(enNombre(payload.fraisPassageAdminFcfa));
      }
    } catch (err) {
      console.error(err);
    }
  }

  /** Les règles (essai, prix, limites) sont vérifiées côté serveur. */
  async function executerChangementPlan(plan: 'STANDARD' | 'PREMIUM') {
    setActionAbonnement(true);
    setToast(null);
    try {
      const res = await apiFetch('/api/subscriptions/changer-plan', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extraireMessageErreur(payload, 'Changement de plan impossible. Réessayez.'));
      }
      setPlanAChanger(null);
      setToast({ message: `Plan ${plan} activé.`, ton: 'succes' });
      await chargerProfil();
    } catch (err: any) {
      setToast({
        message: err.message || 'Changement de plan impossible. Réessayez.',
        ton: 'danger',
      });
    } finally {
      setActionAbonnement(false);
    }
  }

  async function renouveler() {
    setActionAbonnement(true);
    setToast(null);
    try {
      const res = await apiFetch('/api/subscriptions/renouveler', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extraireMessageErreur(payload, 'Renouvellement impossible. Réessayez.'));
      }
      setToast({ message: 'Abonnement renouvelé.', ton: 'succes' });
      await chargerProfil();
    } catch (err: any) {
      setToast({
        message: err.message || 'Renouvellement impossible. Réessayez.',
        ton: 'danger',
      });
    } finally {
      setActionAbonnement(false);
    }
  }

  async function sauvegarder(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSauvegarde(true);
      setToast(null);
      const res = await apiFetch('/api/member/profil', {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          extraireMessageErreur(
            payload,
            'Impossible de mettre à jour le profil. Vérifiez les informations saisies.',
          ),
        );
      }
      setToast({ message: 'Profil mis à jour.', ton: 'succes' });
      await chargerProfil();
    } catch (err: any) {
      setToast({
        message:
          err.message ||
          'Impossible de mettre à jour le profil. Vérifiez les informations saisies.',
        ton: 'danger',
      });
    } finally {
      setSauvegarde(false);
    }
  }

  /**
   * Passage au rôle ADMIN_TONTINE après paiement unique. Le prix vient du
   * serveur ; le rôle n'est accordé qu'après confirmation du paiement.
   */
  async function payerPourDevenirAdmin() {
    setDevenirAdminEnCours(true);
    setToast(null);
    try {
      const res = await apiFetch('/api/member/devenir-admin', {
        method: 'POST',
        body: JSON.stringify({ provider: providerPassageAdmin }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          extraireMessageErreur(payload, 'Impossible d’initier le paiement. Réessayez.'),
        );
      }
      const reference = (payload as { referenceInterne?: string }).referenceInterne;
      if (!reference) throw new Error('Référence de paiement manquante. Réessayez.');
      setReferencePassageAdmin(reference);
      await confirmerPassageAdmin(reference);
    } catch (err: any) {
      setToast({
        message: err.message || 'Impossible de devenir administrateur. Réessayez.',
        ton: 'danger',
      });
    } finally {
      setDevenirAdminEnCours(false);
    }
  }

  /** Confirmation idempotente : c'est ici seulement que le serveur change le rôle. */
  async function confirmerPassageAdmin(reference: string) {
    setDevenirAdminEnCours(true);
    setToast(null);
    try {
      const res = await apiFetch('/api/member/devenir-admin/confirmer', {
        method: 'POST',
        body: JSON.stringify({ referenceInterne: reference }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extraireMessageErreur(payload, 'Paiement non confirmé. Réessayez.'));
      }

      setProfil((prev) => (prev ? { ...prev, role: 'ADMIN_TONTINE' } : prev));
      const token = getToken();
      const utilisateur = getCurrentUser<Record<string, unknown>>();
      if (token && utilisateur) {
        setSession(token, { ...utilisateur, role: 'ADMIN_TONTINE' });
      }
      setReferencePassageAdmin(null);
      setConfirmationPassageOuverte(false);
      setToast({
        message: extraireMessageErreur(payload, 'Vous êtes désormais administrateur.'),
        ton: 'succes',
      });
    } catch (err: any) {
      setToast({
        message: err.message || 'Paiement non confirmé. Réessayez.',
        ton: 'danger',
      });
    } finally {
      setDevenirAdminEnCours(false);
    }
  }

  const abonnement = profil?.abonnement ?? null;
  const estAdmin = profil?.role === 'ADMIN_TONTINE' || profil?.role === 'SUPER_ADMIN';
  const prixPassageAdmin =
    fraisPassageAdmin === null ? 'Prix indisponible pour le moment' : formaterMontant(fraisPassageAdmin);
  const moyenPaiementChoisi = PROVIDERS.find((p) => p.id === providerPassageAdmin)?.label ?? '';

  if (loading) {
    return (
      <div className="mx-auto max-w-content px-4 py-10 text-body text-muted-canvas" role="status">
        Chargement...
      </div>
    );
  }

  if (!profil) {
    return (
      <Card className="mx-auto max-w-content p-6">
        <h1 className="font-display text-section font-semibold text-ink">Profil introuvable</h1>
        <p className="mt-2 text-body text-muted-canvas">
          Impossible de charger votre profil. Vérifiez votre connexion puis réessayez.
        </p>
        <Button className="mt-5" onClick={() => void chargerProfil()}>
          Réessayer
        </Button>
      </Card>
    );
  }

  const statutAbonnement = !abonnement?.actif
    ? 'Expiré'
    : abonnement.enEssai
      ? 'Période d’essai gratuite'
      : 'Actif';
  const classesStatutAbonnement = !abonnement?.actif
    ? 'bg-danger-surface text-danger'
    : abonnement.enEssai
      ? 'border border-warning bg-warning-surface text-ink'
      : 'bg-success-surface text-success';

  return (
    <div className="mx-auto max-w-content space-y-6 px-4 py-8">
      <div>
        <h1 className="font-display text-section font-semibold text-ink">Mon profil</h1>
        <p className="mt-1 text-body text-muted-canvas">
          Vos informations, votre abonnement et vos notifications.
        </p>
      </div>

      {toast && (
        <Toast message={toast.message} ton={toast.ton} onFermer={() => setToast(null)} />
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span
            className="flex h-control w-control shrink-0 items-center justify-center rounded-pill bg-canvas font-display text-lead font-semibold text-ink"
            aria-hidden="true"
          >
            {profil.prenom.charAt(0)}
            {profil.nom.charAt(0)}
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lead font-semibold text-ink">
              {profil.prenom} {profil.nom}
            </h2>
            <p className="mt-1 break-all text-body text-muted-canvas">{profil.email}</p>
            <span className="mt-2 inline-flex rounded-pill bg-canvas px-3 py-1 text-meta font-medium text-muted-canvas">
              {libelleRole(profil.role)}
            </span>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-meta text-muted-canvas">Téléphone</dt>
            <dd className="mt-1 text-body font-semibold text-ink" dir="ltr">
              {profil.telephone}
            </dd>
          </div>
          <div>
            <dt className="text-meta text-muted-canvas">Vérification</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex rounded-pill px-3 py-1 text-meta font-medium ${
                  profil.isVerified
                    ? 'bg-success-surface text-success'
                    : 'bg-danger-surface text-danger'
                }`}
              >
                {profil.isVerified ? 'Vérifié' : 'Non vérifié'}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-meta text-muted-canvas">Membre depuis</dt>
            <dd className="mt-1 text-body font-semibold text-ink">
              {formaterDateComplete(profil.createdAt)}
            </dd>
          </div>
        </dl>

        {profil.codeAdhesion && (
          <div className="mt-5 rounded-card border border-line bg-canvas p-4">
            <p className="text-meta text-muted-canvas">Votre code d’adhésion</p>
            <p className="mt-1 select-all font-display text-lead font-semibold tracking-wider text-ink">
              {profil.codeAdhesion}
            </p>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-section font-semibold text-ink">
          Modifier mes informations
        </h2>
        <form onSubmit={sauvegarder} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Prénom"
              value={form.prenom}
              onChange={(e) => setForm({ ...form, prenom: e.target.value })}
            />
            <Input
              label="Nom"
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
            />
          </div>
          <Input
            label="Téléphone"
            type="tel"
            dir="ltr"
            value={form.telephone}
            onChange={(e) => setForm({ ...form, telephone: e.target.value })}
          />
          <Button type="submit" disabled={sauvegarde}>
            {sauvegarde ? 'Sauvegarde en cours...' : 'Sauvegarder'}
          </Button>
        </form>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-display text-section font-semibold text-ink">Mon abonnement</h2>
          <p className="mt-1 text-body text-muted-canvas">
            Les prix et les limites affichés viennent de la configuration serveur.
          </p>
        </div>

        {abonnement ? (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-meta text-muted-canvas">Plan</dt>
              <dd className="mt-1 text-body font-semibold text-ink">{abonnement.plan}</dd>
            </div>
            <div>
              <dt className="text-meta text-muted-canvas">Prix du plan</dt>
              <dd className="mt-1 font-display text-lead font-semibold tabular-nums text-ink">
                {formaterMontant(abonnement.prixMensuel)}
              </dd>
            </div>
            <div>
              <dt className="text-meta text-muted-canvas">Statut</dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex rounded-pill px-3 py-1 text-meta font-medium ${classesStatutAbonnement}`}
                >
                  {statutAbonnement}
                </span>
              </dd>
            </div>
            {abonnement.dateFin && (
              <div>
                <dt className="text-meta text-muted-canvas">Échéance</dt>
                <dd className="mt-1 text-body font-semibold text-ink">
                  {formaterDateComplete(abonnement.dateFin)}
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-body text-muted-canvas">Aucun abonnement enregistré.</p>
        )}

        {abonnement && abonnement.plan !== 'GRATUIT' && !abonnement.actif && (
          <Button disabled={actionAbonnement} onClick={() => void renouveler()}>
            {actionAbonnement ? 'Renouvellement en cours...' : 'Renouveler mon abonnement'}
          </Button>
        )}

        {estAdmin && (
          <div className="space-y-4 border-t border-line pt-4">
            <h3 className="font-display text-body font-semibold text-ink">Choisir un plan</h3>
            {grille ? (
              <dl className="space-y-3">
                <div className="rounded-card border border-line bg-canvas p-4">
                  <dt className="text-body font-semibold text-ink">GRATUIT</dt>
                  <dd className="mt-1 text-body text-muted-canvas">
                    {grille.limiteTontinesGratuites} tontine
                    {grille.limiteTontinesGratuites > 1 ? 's' : ''}
                  </dd>
                </div>
                <div className="rounded-card border border-line bg-canvas p-4">
                  <dt className="text-body font-semibold text-ink">STANDARD</dt>
                  <dd className="mt-1 text-body text-muted-canvas">
                    {formaterMontant(grille.prixStandardFcfa)} / {grille.dureeAbonnementJours} jours ·{' '}
                    {grille.limiteTontinesStandard} tontines
                  </dd>
                </div>
                <div className="rounded-card border border-line bg-canvas p-4">
                  <dt className="text-body font-semibold text-ink">PREMIUM</dt>
                  <dd className="mt-1 text-body text-muted-canvas">
                    {formaterMontant(grille.prixPremiumFcfa)} / {grille.dureeAbonnementJours} jours ·
                    tontines illimitées
                  </dd>
                </div>
                <p className="text-meta text-muted-canvas">
                  Essai gratuit : {grille.dureeEssaiJours} jours, une seule fois.
                </p>
              </dl>
            ) : (
              <p className="text-body text-muted-canvas">Grille indisponible pour le moment.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={actionAbonnement}
                onClick={() => setPlanAChanger('STANDARD')}
              >
                Choisir STANDARD
              </Button>
              <Button disabled={actionAbonnement} onClick={() => setPlanAChanger('PREMIUM')}>
                Choisir PREMIUM
              </Button>
            </div>
          </div>
        )}
      </Card>

      {!estAdmin && (
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="font-display text-section font-semibold text-ink">
              Devenir administrateur
            </h2>
            <p className="mt-2 text-body text-muted-canvas">
              Seuls les administrateurs peuvent créer une tontine. Le passage coûte{' '}
              {prixPassageAdmin}, en paiement unique. Votre numéro de téléphone doit être vérifié.
            </p>
          </div>
          <fieldset>
            <legend className="text-body font-medium text-ink">Moyen de paiement</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PROVIDERS.map((p) => (
                <Button
                  key={p.id}
                  variant={providerPassageAdmin === p.id ? 'primary' : 'secondary'}
                  aria-pressed={providerPassageAdmin === p.id}
                  disabled={devenirAdminEnCours}
                  onClick={() => setProviderPassageAdmin(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </fieldset>
          {referencePassageAdmin && (
            <Button
              variant="secondary"
              disabled={devenirAdminEnCours}
              onClick={() => void confirmerPassageAdmin(referencePassageAdmin)}
            >
              Confirmer le paiement ({prixPassageAdmin})
            </Button>
          )}
          <Button
            disabled={
              devenirAdminEnCours || referencePassageAdmin !== null || fraisPassageAdmin === null
            }
            onClick={() => setConfirmationPassageOuverte(true)}
          >
            {devenirAdminEnCours
              ? 'Patientez...'
              : referencePassageAdmin
                ? 'Paiement en attente de confirmation'
                : fraisPassageAdmin === null
                  ? 'Prix indisponible pour le moment'
                  : `Devenir Admin — ${prixPassageAdmin}`}
          </Button>
        </Card>
      )}

      <NotificationsSection />

      <Card className="p-5">
        <h2 className="font-display text-section font-semibold text-ink">Besoin d’aide ?</h2>
        <p className="mt-1 text-body text-muted-canvas">
          Vous pouvez joindre le support depuis cette page ou depuis l’en-tête.
        </p>
        <div className="mt-4">
          <SupportButton variante="section" />
        </div>
      </Card>

      <Modal
        ouvert={planAChanger !== null}
        onFermer={() => setPlanAChanger(null)}
        titre="Changer de plan"
      >
        {planAChanger && (
          <div className="space-y-4">
            <p className="text-body text-muted-canvas">
              Passer au plan {planAChanger} ? Le premier plan payant démarre par une période d’essai
              gratuite ; le paiement est simulé dans cette version.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={actionAbonnement}
                onClick={() => void executerChangementPlan(planAChanger)}
              >
                Confirmer le changement
              </Button>
              <Button variant="secondary" onClick={() => setPlanAChanger(null)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        ouvert={confirmationPassageOuverte}
        onFermer={() => setConfirmationPassageOuverte(false)}
        titre="Devenir administrateur"
      >
        <div className="space-y-4">
          <p className="text-body text-muted-canvas">
            Paiement unique de {prixPassageAdmin}. Le rôle sera activé après confirmation du
            paiement.
          </p>
          <p className="text-body text-ink">Moyen de paiement : {moyenPaiementChoisi}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={devenirAdminEnCours || fraisPassageAdmin === null}
              onClick={() => void payerPourDevenirAdmin()}
            >
              {devenirAdminEnCours ? 'Traitement en cours...' : `Payer ${prixPassageAdmin}`}
            </Button>
            <Button
              variant="secondary"
              disabled={devenirAdminEnCours}
              onClick={() => setConfirmationPassageOuverte(false)}
            >
              Annuler
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
