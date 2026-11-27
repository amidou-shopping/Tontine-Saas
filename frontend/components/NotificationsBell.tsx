'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { apiFetch, extraireMessageErreur, getToken } from '@/lib/api';

interface NotificationMembre {
  id: string;
  titre?: string;
  message?: string;
  contenu?: string;
  /** Lien interne vers la page concernée (ex: gestion d'une demande). */
  lien?: string | null;
  createdAt: string;
  isLu?: boolean;
  lu?: boolean;
  estLu?: boolean;
  [cle: string]: unknown;
}

function estLue(notification: NotificationMembre) {
  return notification.isLu ?? notification.lu ?? notification.estLu ?? false;
}

export default function NotificationsBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationMembre[]>([]);
  const [ouverte, setOuverte] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tentative, setTentative] = useState(0);
  const [marquageEnCours, setMarquageEnCours] = useState<string | null>(null);
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getToken()) return;
    let actif = true;

    async function chargerNotifications() {
      setLoading(true);
      setErreur(null);
      try {
        const res = await apiFetch('/api/member/notifications');
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (actif) {
            setErreur(
              `${extraireMessageErreur(data, 'Impossible de charger les notifications.')} Réessayez.`,
            );
          }
          return;
        }
        const payload = (await res.json().catch(() => ({}))) ?? {};
        const liste: unknown = Array.isArray(payload) ? payload : payload.data ?? [];
        if (actif) setNotifications(Array.isArray(liste) ? (liste as NotificationMembre[]) : []);
      } catch (err) {
        console.error(err);
        if (actif) setErreur('Impossible de charger les notifications. Réessayez.');
      } finally {
        if (actif) setLoading(false);
      }
    }

    chargerNotifications();
    return () => {
      actif = false;
    };
  }, [tentative]);

  // Fermeture de la liste au clic à l'extérieur ou avec Échap.
  useEffect(() => {
    if (!ouverte) return;
    function fermerAuClic(event: MouseEvent) {
      if (conteneur.current && !conteneur.current.contains(event.target as Node)) {
        setOuverte(false);
      }
    }
    function fermerAvecEchap(event: KeyboardEvent) {
      if (event.key === 'Escape') setOuverte(false);
    }
    document.addEventListener('mousedown', fermerAuClic);
    document.addEventListener('keydown', fermerAvecEchap);
    return () => {
      document.removeEventListener('mousedown', fermerAuClic);
      document.removeEventListener('keydown', fermerAvecEchap);
    };
  }, [ouverte]);

  const nonLues = notifications.filter((n) => !estLue(n)).length;

  async function marquerCommeLu(notification: NotificationMembre): Promise<boolean> {
    setMarquageEnCours(notification.id);
    setErreur(null);
    try {
      const res = await apiFetch(`/api/member/notifications/${notification.id}/lu`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErreur(
          `${extraireMessageErreur(data, 'Impossible de marquer cette notification comme lue.')} Réessayez.`,
        );
        return false;
      }
      // Mise à jour locale immédiate : inutile de recharger toute la liste.
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, isLu: true, lu: true, estLu: true } : n,
        ),
      );
      return true;
    } catch (err) {
      console.error(err);
      setErreur('Une erreur est survenue. Réessayez.');
      return false;
    } finally {
      setMarquageEnCours(null);
    }
  }

  /** Clic sur une notification liée : marquée comme lue puis ouverture de la page. */
  async function ouvrirNotification(notification: NotificationMembre) {
    const lien = notification.lien;
    if (!lien) return;
    setErreur(null);
    if (!estLue(notification)) {
      const marque = await marquerCommeLu(notification);
      if (!marque) return; // on n'ouvre pas la cible si le marquage a échoué
    }
    setOuverte(false);
    router.push(lien);
  }

  return (
    <div className="relative" ref={conteneur}>
      <button
        type="button"
        aria-label={`Notifications${nonLues > 0 ? `, ${nonLues} non lue(s)` : ''}`}
        aria-expanded={ouverte}
        onClick={() => setOuverte((v) => !v)}
        className="relative flex min-h-touch min-w-touch items-center justify-center rounded-pill text-ink hover:bg-canvas focus-ring"
      >
        <Bell className="h-icon w-icon" aria-hidden="true" />
        {nonLues > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-icon min-w-icon items-center justify-center rounded-pill bg-danger px-1 text-meta font-semibold tabular-nums text-surface">
            {nonLues}
          </span>
        )}
      </button>

      {ouverte && (
        <div className="absolute right-0 z-floating mt-2 w-80 max-w-popover rounded-card border border-line bg-surface shadow-floating">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-body font-semibold text-ink">Notifications</p>
            <button
              type="button"
              onClick={() => setTentative((n) => n + 1)}
              className="min-h-touch rounded-pill px-2 text-meta font-medium text-muted-canvas hover:bg-canvas focus-ring"
            >
              Actualiser
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && <p className="px-4 py-6 text-center text-body text-muted-canvas">Chargement des notifications...</p>}

            {erreur && !loading && (
              <div role="alert" className="px-4 py-4 text-meta text-danger">
                <p>{erreur}</p>
                <button
                  type="button"
                  onClick={() => setTentative((n) => n + 1)}
                  className="mt-2 min-h-touch rounded-pill px-2 font-semibold underline focus-ring"
                >
                  Réessayer
                </button>
              </div>
            )}

            {!loading && !erreur && notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-body text-muted-canvas">
                Aucune notification pour le moment.
              </p>
            )}

            {!loading && !erreur && notifications.map((n) => {
              const lue = estLue(n);
              const contenu = (
                <>
                  {n.titre && (
                    <p className={`text-body ${lue ? 'font-medium' : 'font-semibold'} text-ink`}>
                      {n.titre}
                    </p>
                  )}
                  <p className="whitespace-pre-line text-meta text-muted-canvas">
                    {n.message ?? n.contenu ?? ''}
                  </p>
                </>
              );
              return (
                <div key={n.id} className="border-b border-line px-4 py-3 last:border-0">
                  {n.lien ? (
                    <button
                      type="button"
                      disabled={marquageEnCours === n.id}
                      onClick={() => ouvrirNotification(n)}
                      className="w-full rounded-control text-left focus-ring disabled:opacity-50"
                    >
                      {contenu}
                    </button>
                  ) : (
                    <div>{contenu}</div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-meta text-muted">
                      {n.createdAt ? new Date(n.createdAt).toLocaleString('fr-FR') : ''}
                    </span>
                    {!lue && <span className="text-meta font-medium text-ink">Non lue</span>}
                    {n.lien ? (
                      <span className="text-meta font-semibold text-ink">
                        {marquageEnCours === n.id ? 'Ouverture...' : 'Ouvrir'}
                      </span>
                    ) : !lue ? (
                      <button
                        type="button"
                        disabled={marquageEnCours === n.id}
                        onClick={() => marquerCommeLu(n)}
                        className="min-h-touch rounded-pill px-2 text-meta font-semibold text-ink underline hover:bg-canvas focus-ring disabled:opacity-50"
                      >
                        {marquageEnCours === n.id ? 'Marquage...' : 'Marquer comme lue'}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
