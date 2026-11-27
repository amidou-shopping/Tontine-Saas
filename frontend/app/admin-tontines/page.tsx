'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  apiFetch,
  getProfilServeur,
  enNombre,
  extraireMessageErreur,
} from '@/lib/api';
import { formaterDate, formaterDateComplete, formaterMontant } from '@/lib/affichage';
import { JOURS_SEMAINE, LIBELLES_JOURS, texteDuree, type JourSemaine } from '@/lib/jours-semaine';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import StatutBadge from '@/components/ui/StatutBadge';
import Textarea from '@/components/ui/Textarea';
import Toast from '@/components/ui/Toast';

interface DemandeEnAttente {
  id: string;
  statut: string;
  createdAt: string;
  user: { id: string; nom: string; prenom: string; email: string };
}

interface DemandeAffichee extends DemandeEnAttente {
  tontineId: string;
  tontineNom: string;
}

interface DemandeDetail {
  id: string;
  statut: string;
  traiteeAt: string | null;
  motifRefus: string | null;
  dejaTraitee: boolean;
  message: string;
  user: { id: string; nom: string; prenom: string; email: string };
  tontine: { id: string; nom: string };
}

interface MembreAdmin {
  id: string;
  ordrePassage: number;
  statut: string;
  user: { id: string; nom: string; prenom: string; email: string };
}

interface TontineAdmin {
  id: string;
  nom: string;
  description: string | null;
  montantCotisation: number;
  frequence: string;
  nombreMaxMembres: number;
  statut: string;
  cycleActuel: number;
  codeInvitation: string;
  dateDebut: string | null;
  createurId: string;
  demandesAdhesion: DemandeEnAttente[];
  membres: MembreAdmin[];
  _count: { membres: number; demandesAdhesion?: number };
}

const COLONNES_MEMBRES: Column<MembreAdmin>[] = [
  {
    key: 'tour',
    header: 'Tour',
    render: (m) => <span className="tabular-nums font-semibold">{m.ordrePassage}</span>,
  },
  {
    key: 'membre',
    header: 'Membre',
    render: (m) => (
      <div>
        <p className="font-medium text-ink">
          {m.user.prenom} {m.user.nom}
        </p>
        <p className="text-meta text-muted-canvas">{m.user.email}</p>
      </div>
    ),
  },
  {
    key: 'statut',
    header: 'Statut',
    align: 'right',
    render: (m) => <StatutBadge statut={m.statut} />,
  },
];

type TonToast = 'succes' | 'danger' | 'information';

export default function AdminTontinesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-shell px-4 py-10 text-body text-muted-canvas" role="status">
          Chargement...
        </div>
      }
    >
      <AdminTontinesContenu />
    </Suspense>
  );
}

function AdminTontinesContenu() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demandeCibleId = searchParams.get('demandeId');
  const [tontines, setTontines] = useState<TontineAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [modalCreationOuverte, setModalCreationOuverte] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);
  const [demandeCible, setDemandeCible] = useState<DemandeDetail | null>(null);
  const [nouvelleTontine, setNouvelleTontine] = useState<{
    id: string;
    nom: string;
    codeInvitation: string;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; ton: TonToast } | null>(null);
  const [demandeARefuser, setDemandeARefuser] = useState<DemandeAffichee | null>(null);
  const [motifRefus, setMotifRefus] = useState('');
  const [tontineADemarrer, setTontineADemarrer] = useState<TontineAdmin | null>(null);
  const [membreAExclure, setMembreAExclure] = useState<{
    tontine: TontineAdmin;
    membre: MembreAdmin;
  } | null>(null);
  const [formTontine, setFormTontine] = useState({
    nom: '',
    description: '',
    montantCotisation: '',
    jourCotisation: 'LUNDI' as JourSemaine,
    nombreMaxMembres: '10',
  });

  useEffect(() => {
    async function verifierAcces() {
      // Le rôle autorisé vient du serveur, pas de localStorage.
      const profil = await getProfilServeur<{ role: string }>();
      if (!profil) {
        router.push('/login');
        return;
      }
      if (profil.role !== 'ADMIN_TONTINE' && profil.role !== 'SUPER_ADMIN') {
        router.push('/dashboard');
        return;
      }
      await chargerTontines();
      await chargerDemandeCible();
    }
    verifierAcces();
  }, [demandeCibleId]);

  async function chargerTontines() {
    try {
      setLoading(true);
      setErreurChargement(null);
      const res = await apiFetch('/api/tontines/admin/mes-tontines');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Impossible de charger vos tontines. Réessayez.');
      const data: TontineAdmin[] = await res.json();
      setTontines(
        data.map((t) => ({
          ...t,
          montantCotisation: enNombre(t.montantCotisation),
        })),
      );
    } catch (err: any) {
      console.error(err);
      setErreurChargement(err.message || 'Impossible de charger vos tontines. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  /** Ouvre la demande ciblée par le lien reçu par notification. */
  async function chargerDemandeCible() {
    if (!demandeCibleId) return;
    try {
      const res = await apiFetch(`/api/tontines/demandes/${demandeCibleId}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({
          message: extraireMessageErreur(payload, 'Impossible d’ouvrir cette demande. Réessayez.'),
          ton: 'danger',
        });
        return;
      }
      const detail = payload as DemandeDetail;
      setDemandeCible(detail);
      if (detail.dejaTraitee) {
        setToast({
          message: detail.message || 'Cette demande a déjà été traitée.',
          ton: 'information',
        });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Impossible d’ouvrir cette demande. Réessayez.', ton: 'danger' });
    }
  }

  useEffect(() => {
    if (!demandeCible) return;
    const demandeEstVisible =
      !demandeCible.dejaTraitee &&
      tontines.some((t) => t.id === demandeCible.tontine.id);
    const identifiant = demandeEstVisible
      ? `demande-${demandeCible.id}`
      : 'demandes-en-attente';
    document.getElementById(identifiant)?.scrollIntoView({ block: 'start' });
  }, [demandeCible, tontines]);

  async function creerTontine(e: React.FormEvent) {
    e.preventDefault();
    try {
      setCreationEnCours(true);
      const res = await apiFetch('/api/tontines', {
        method: 'POST',
        body: JSON.stringify({
          nom: formTontine.nom,
          description: formTontine.description,
          montantCotisation: Number(formTontine.montantCotisation),
          jourCotisation: formTontine.jourCotisation,
          nombreMaxMembres: Number(formTontine.nombreMaxMembres),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          extraireMessageErreur(payload, 'Impossible de créer la tontine. Vérifiez les informations saisies.'),
        );
      }
      setNouvelleTontine(payload);
      setModalCreationOuverte(false);
      setFormTontine({
        nom: '',
        description: '',
        montantCotisation: '',
        jourCotisation: 'LUNDI',
        nombreMaxMembres: '10',
      });
      setToast({ message: 'Tontine créée.', ton: 'succes' });
      void chargerTontines();
    } catch (err: any) {
      console.error(err);
      setToast({
        message: err.message || 'Impossible de créer la tontine. Vérifiez les informations saisies.',
        ton: 'danger',
      });
    } finally {
      setCreationEnCours(false);
    }
  }

  async function demarrerTontine(id: string) {
    try {
      setActionEnCours(id);
      const res = await apiFetch(`/api/tontines/${id}/demarrer`, { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extraireMessageErreur(payload, 'Impossible de démarrer la tontine. Réessayez.'));
      }
      setTontineADemarrer(null);
      setToast({ message: 'Tontine démarrée. L’ordre de passage a été tiré au sort.', ton: 'succes' });
      void chargerTontines();
    } catch (err: any) {
      console.error(err);
      setToast({
        message: err.message || 'Impossible de démarrer la tontine. Réessayez.',
        ton: 'danger',
      });
    } finally {
      setActionEnCours(null);
    }
  }

  /** Accepter ou refuser une demande d'adhésion. */
  async function traiterDemande(demandeId: string, accepter: boolean, motif?: string) {
    try {
      setActionEnCours(demandeId);
      const res = await apiFetch(
        `/api/tontines/demandes/${demandeId}/${accepter ? 'accepter' : 'refuser'}`,
        {
          method: 'POST',
          ...(accepter ? {} : { body: JSON.stringify({ motifRefus: motif ?? undefined }) }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extraireMessageErreur(payload, 'Impossible de traiter la demande. Réessayez.'));
      }
      setDemandeARefuser(null);
      setToast({
        message: accepter ? 'Demande acceptée.' : 'Demande refusée.',
        ton: 'succes',
      });
      void chargerTontines();
    } catch (err: any) {
      console.error(err);
      setToast({
        message: err.message || 'Impossible de traiter la demande. Réessayez.',
        ton: 'danger',
      });
    } finally {
      setActionEnCours(null);
    }
  }

  /** Exclut un membre ; le net réglé est remboursé à la clôture. */
  async function exclureMembre(tontineId: string, userId: string) {
    try {
      setActionEnCours(userId);
      const res = await apiFetch(`/api/tontines/${tontineId}/membres/${userId}/exclure`, {
        method: 'POST',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extraireMessageErreur(payload, 'Impossible d’exclure le membre. Réessayez.'));
      }
      setMembreAExclure(null);
      setToast({ message: 'Membre exclu de la tontine.', ton: 'succes' });
      void chargerTontines();
    } catch (err: any) {
      console.error(err);
      setToast({
        message: err.message || 'Impossible d’exclure le membre. Réessayez.',
        ton: 'danger',
      });
    } finally {
      setActionEnCours(null);
    }
  }

  const demandesEnAttente: DemandeAffichee[] = tontines.flatMap((t) =>
    t.demandesAdhesion.map((d) => ({
      ...d,
      tontineId: t.id,
      tontineNom: t.nom,
    })),
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-shell px-4 py-10 text-body text-muted-canvas" role="status">
        Chargement...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-shell space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-section font-semibold text-ink">Gérer</h1>
          <p className="mt-1 text-body text-muted-canvas">
            Traitez les demandes, suivez les membres et gérez vos tontines.
          </p>
        </div>
        <Button onClick={() => setModalCreationOuverte(true)}>Créer une tontine</Button>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          ton={toast.ton}
          onFermer={() => setToast(null)}
        />
      )}

      {demandeCible && (
        <Card className="border-line-strong bg-canvas p-4">
          <p className="text-body font-semibold text-ink">
            {demandeCible.dejaTraitee
              ? `Demande ${demandeCible.statut.toLowerCase()} — ${demandeCible.user.prenom} ${demandeCible.user.nom}`
              : `Demande de ${demandeCible.user.prenom} ${demandeCible.user.nom}`}
          </p>
          <p className="mt-1 text-body text-muted-canvas">
            {demandeCible.dejaTraitee
              ? demandeCible.message
              : `Tontine : ${demandeCible.tontine.nom}. Vous pouvez la traiter dans la liste ci-dessous.`}
          </p>
          {demandeCible.motifRefus && (
            <p className="mt-1 text-meta text-muted-canvas">
              Motif du refus : {demandeCible.motifRefus}
            </p>
          )}
        </Card>
      )}

      <section id="demandes-en-attente" className="space-y-3" aria-labelledby="demandes-titre">
        <h2 id="demandes-titre" className="font-display text-lead font-semibold text-ink">
          Demandes en attente ({demandesEnAttente.length})
        </h2>
        {demandesEnAttente.length === 0 ? (
          <EmptyState
            titre="Aucune demande en attente"
            description="Les nouvelles demandes d’adhésion apparaîtront ici."
          />
        ) : (
          <div className="space-y-3">
            {demandesEnAttente.map((d) => {
              const cible = demandeCible?.id === d.id && !demandeCible.dejaTraitee;
              return (
                <Card
                  key={d.id}
                  id={`demande-${d.id}`}
                  aria-current={cible ? 'true' : undefined}
                  className={`p-4 ${cible ? 'border-line-strong bg-canvas' : ''}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">
                        {d.user.prenom} {d.user.nom}
                      </p>
                      <p className="text-meta text-muted-canvas">{d.user.email}</p>
                      <p className="mt-1 text-meta text-muted-canvas">
                        {d.tontineNom} · Demande du {formaterDateComplete(d.createdAt)}
                      </p>
                    </div>
                    <StatutBadge statut="EN_ATTENTE" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      disabled={actionEnCours === d.id}
                      onClick={() => void traiterDemande(d.id, true)}
                    >
                      Accepter
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={actionEnCours === d.id}
                      onClick={() => {
                        setDemandeARefuser(d);
                        setMotifRefus('');
                      }}
                    >
                      Refuser
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="tontines-titre">
        <h2 id="tontines-titre" className="font-display text-lead font-semibold text-ink">
          Mes tontines ({tontines.length})
        </h2>
        {erreurChargement ? (
          <Card className="p-6">
            <p className="text-body font-semibold text-ink">Détail indisponible</p>
            <p className="mt-2 text-body text-muted-canvas">{erreurChargement}</p>
            <Button className="mt-4" onClick={() => void chargerTontines()}>
              Réessayer
            </Button>
          </Card>
        ) : tontines.length === 0 ? (
          <EmptyState
            titre="Aucune tontine créée"
            description="Créez une tontine pour recevoir des demandes d’adhésion."
          />
        ) : (
          <div className="space-y-5">
            {tontines.map((t) => {
              const retards = t.membres.filter(
                (m) => m.statut === 'EN_RETARD' || m.statut === 'ARRIERE',
              );
              const excluables = t.membres.filter(
                (m) => m.user.id !== t.createurId && m.statut !== 'EXCLU',
              );

              return (
                <Card key={t.id} id={`tontine-${t.id}`} className="space-y-5 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lead font-semibold text-ink">{t.nom}</h3>
                      {t.description && (
                        <p className="mt-1 text-body text-muted-canvas">{t.description}</p>
                      )}
                    </div>
                    <StatutBadge statut={t.statut} />
                  </div>

                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <dt className="text-meta text-muted-canvas">Cotisation</dt>
                      <dd className="mt-1 font-display text-lead font-semibold tabular-nums text-ink">
                        {formaterMontant(t.montantCotisation)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-meta text-muted-canvas">Membres</dt>
                      <dd className="mt-1 font-display text-lead font-semibold tabular-nums text-ink">
                        {t._count.membres}/{t.nombreMaxMembres}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-meta text-muted-canvas">Cycle</dt>
                      <dd className="mt-1 font-display text-lead font-semibold tabular-nums text-ink">
                        {t.cycleActuel}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-meta text-muted-canvas">Début</dt>
                      <dd className="mt-1 text-body font-semibold text-ink">
                        {formaterDate(t.dateDebut ?? undefined)}
                      </dd>
                    </div>
                  </dl>

                  <div className="rounded-card border border-line bg-canvas p-4">
                    <p className="text-meta text-muted-canvas">Code d’invitation</p>
                    <p className="mt-1 select-all font-display text-lead font-semibold tracking-wider text-ink">
                      {t.codeInvitation}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-display text-body font-semibold text-ink">
                      Membres ({t.membres.length})
                    </h4>
                    <DataTable
                      columns={COLONNES_MEMBRES}
                      rows={t.membres}
                      getRowKey={(m) => m.id}
                      caption={`Membres de ${t.nom}`}
                      vide="Aucun membre inscrit."
                    />
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-display text-body font-semibold text-ink">
                      Retards ({retards.length})
                    </h4>
                    {retards.length === 0 ? (
                      <p className="text-body text-muted-canvas">Aucun retard signalé.</p>
                    ) : (
                      <ul className="space-y-2">
                        {retards.map((m) => (
                          <li
                            key={m.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line p-3"
                          >
                            <span className="text-body text-ink">
                              {m.user.prenom} {m.user.nom}
                            </span>
                            <StatutBadge statut={m.statut} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-display text-body font-semibold text-ink">Exclusion</h4>
                    {excluables.length === 0 ? (
                      <p className="text-body text-muted-canvas">Aucun membre à exclure.</p>
                    ) : (
                      <ul className="space-y-2">
                        {excluables.map((m) => (
                          <li
                            key={m.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line p-3"
                          >
                            <span className="text-body text-ink">
                              {m.user.prenom} {m.user.nom}
                            </span>
                            <Button
                              variant="secondary"
                              disabled={actionEnCours === m.user.id}
                              onClick={() => setMembreAExclure({ tontine: t, membre: m })}
                            >
                              Exclure
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {t.statut === 'EN_ATTENTE' && t._count.membres >= t.nombreMaxMembres && (
                    <Button
                      className="w-full"
                      disabled={actionEnCours === t.id}
                      onClick={() => setTontineADemarrer(t)}
                    >
                      Démarrer la tontine (tirage au sort)
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        ouvert={modalCreationOuverte}
        onFermer={() => setModalCreationOuverte(false)}
        titre="Créer une tontine"
      >
        <form onSubmit={creerTontine} className="space-y-4">
          <Input
            label="Nom de la tontine"
            required
            value={formTontine.nom}
            onChange={(e) => setFormTontine({ ...formTontine, nom: e.target.value })}
          />
          <Textarea
            label="Description"
            rows={3}
            value={formTontine.description}
            onChange={(e) => setFormTontine({ ...formTontine, description: e.target.value })}
          />
          <Input
            label="Montant de la cotisation (F)"
            type="number"
            required
            min={100}
            value={formTontine.montantCotisation}
            onChange={(e) =>
              setFormTontine({ ...formTontine, montantCotisation: e.target.value })
            }
          />
          <Select
            label="Jour de cotisation"
            options={JOURS_SEMAINE.map((jour) => ({
              value: jour,
              label: LIBELLES_JOURS[jour].charAt(0).toUpperCase() + LIBELLES_JOURS[jour].slice(1),
            }))}
            value={formTontine.jourCotisation}
            onChange={(e) =>
              setFormTontine({
                ...formTontine,
                jourCotisation: e.target.value as JourSemaine,
              })
            }
          />
          <Input
            label="Nombre maximum de membres"
            type="number"
            required
            min={2}
            max={50}
            value={formTontine.nombreMaxMembres}
            aide={texteDuree(formTontine.nombreMaxMembres, formTontine.jourCotisation)}
            onChange={(e) =>
              setFormTontine({ ...formTontine, nombreMaxMembres: e.target.value })
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={creationEnCours}>
              {creationEnCours ? 'Création en cours...' : 'Créer la tontine'}
            </Button>
            <Button variant="secondary" onClick={() => setModalCreationOuverte(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        ouvert={nouvelleTontine !== null}
        onFermer={() => setNouvelleTontine(null)}
        titre="Tontine créée"
      >
        {nouvelleTontine && (
          <div className="space-y-4">
            <p className="text-body text-muted-canvas">
              Partagez ce code d’invitation avec les membres.
            </p>
            <div className="rounded-card border border-line bg-canvas p-4">
              <p className="text-meta text-muted-canvas">Code d’invitation</p>
              <p className="mt-1 select-all font-display text-lead font-semibold tracking-wider text-ink">
                {nouvelleTontine.codeInvitation}
              </p>
            </div>
            <Button className="w-full" onClick={() => setNouvelleTontine(null)}>
              Fermer
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        ouvert={demandeARefuser !== null}
        onFermer={() => setDemandeARefuser(null)}
        titre="Refuser la demande"
      >
        {demandeARefuser && (
          <div className="space-y-4">
            <p className="text-body text-muted-canvas">
              Refuser la demande de {demandeARefuser.user.prenom} {demandeARefuser.user.nom} pour «{' '}
              {demandeARefuser.tontineNom} » ?
            </p>
            <Textarea
              label="Motif du refus (facultatif)"
              rows={3}
              value={motifRefus}
              aide="Le membre pourra lire ce motif."
              onChange={(e) => setMotifRefus(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={actionEnCours === demandeARefuser.id}
                onClick={() =>
                  void traiterDemande(demandeARefuser.id, false, motifRefus)
                }
              >
                Refuser la demande
              </Button>
              <Button variant="secondary" onClick={() => setDemandeARefuser(null)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        ouvert={tontineADemarrer !== null}
        onFermer={() => setTontineADemarrer(null)}
        titre="Démarrer la tontine"
      >
        {tontineADemarrer && (
          <div className="space-y-4">
            <p className="text-body text-muted-canvas">
              Démarrer « {tontineADemarrer.nom} » ? L’ordre de passage sera tiré au sort et tous les
              membres devront cotiser chaque semaine.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={actionEnCours === tontineADemarrer.id}
                onClick={() => void demarrerTontine(tontineADemarrer.id)}
              >
                Démarrer la tontine
              </Button>
              <Button variant="secondary" onClick={() => setTontineADemarrer(null)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        ouvert={membreAExclure !== null}
        onFermer={() => setMembreAExclure(null)}
        titre="Exclure le membre"
      >
        {membreAExclure && (
          <div className="space-y-4">
            <p className="text-body text-muted-canvas">
              Exclure {membreAExclure.membre.user.prenom} {membreAExclure.membre.user.nom} de «{' '}
              {membreAExclure.tontine.nom} » ? Les sommes déjà réglées lui seront remboursées à la
              clôture.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={actionEnCours === membreAExclure.membre.user.id}
                onClick={() =>
                  void exclureMembre(
                    membreAExclure.tontine.id,
                    membreAExclure.membre.user.id,
                  )
                }
              >
                Exclure le membre
              </Button>
              <Button variant="secondary" onClick={() => setMembreAExclure(null)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
