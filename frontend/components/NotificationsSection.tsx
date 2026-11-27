'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, extraireMessageErreur } from '@/lib/api';
import { formaterDateHeure } from '@/lib/affichage';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

interface NotificationMembre {
  id: string;
  titre?: string;
  message?: string;
  contenu?: string;
  /** Lien interne vers la page concernée (ex. gestion d'une demande). */
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

/** Liste complète des notifications, ancrée sur /profil#notifications. */
export default function NotificationsSection() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationMembre[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tentative, setTentative] = useState(0);
  const [marquageEnCours, setMarquageEnCours] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    async function chargerNotifications() {
      setLoading(true);
      setErreur(null);
      try {
        const res = await apiFetch('/api/member/notifications');
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          if (actif) {
            setErreur(
              `${extraireMessageErreur(payload, 'Impossible de charger les notifications.')} Réessayez.`,
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

  async function marquerCommeLu(notification: NotificationMembre): Promise<boolean> {
    setMarquageEnCours(notification.id);
    setErreur(null);
    try {
      const res = await apiFetch(`/api/member/notifications/${notification.id}/lu`, {
        method: 'POST',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setErreur(
          `${extraireMessageErreur(payload, 'Impossible de marquer cette notification comme lue.')} Réessayez.`,
        );
        return false;
      }
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

  async function ouvrirNotification(notification: NotificationMembre) {
    const lien = notification.lien;
    if (!lien) return;
    if (!estLue(notification)) {
      const marque = await marquerCommeLu(notification);
      if (!marque) return;
    }
    router.push(lien);
  }

  const nonLues = notifications.filter((n) => !estLue(n)).length;

  return (
    <Card id="notifications" className="scroll-mt-header space-y-4 p-5" aria-labelledby="notifications-titre">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="notifications-titre" className="font-display text-section font-semibold text-ink">
            Notifications
          </h2>
          <p className="mt-1 text-body text-muted-canvas">
            {nonLues > 0 ? `${nonLues} notification(s) non lue(s).` : 'Toutes vos notifications sont lues.'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setTentative((n) => n + 1)}>
          Actualiser
        </Button>
      </div>

      {erreur && (
        <div role="alert" className="rounded-card border border-danger bg-danger-surface p-4">
          <p className="text-body text-danger">{erreur}</p>
          <Button className="mt-3" onClick={() => setTentative((n) => n + 1)}>
            Réessayer
          </Button>
        </div>
      )}

      {loading && <p className="text-body text-muted-canvas" role="status">Chargement des notifications...</p>}

      {!loading && !erreur && notifications.length === 0 && (
        <p className="text-body text-muted-canvas">Aucune notification pour le moment.</p>
      )}

      {!loading && !erreur && notifications.length > 0 && (
        <ul className="space-y-3">
          {notifications.map((n) => {
            const lue = estLue(n);
            return (
              <li key={n.id} className="rounded-card border border-line p-4">
                {n.titre && (
                  <p className={`text-body text-ink ${lue ? 'font-medium' : 'font-semibold'}`}>
                    {n.titre}
                  </p>
                )}
                {n.message ?? n.contenu ? (
                  <p className="mt-1 whitespace-pre-line text-body text-muted-canvas">
                    {n.message ?? n.contenu}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-meta text-muted-canvas">
                    {formaterDateHeure(n.createdAt)}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {!lue && (
                      <span className="rounded-pill bg-canvas px-3 py-1 text-meta font-medium text-muted-canvas">
                        Non lue
                      </span>
                    )}
                    {n.lien ? (
                      <Button
                        variant="secondary"
                        disabled={marquageEnCours === n.id}
                        onClick={() => void ouvrirNotification(n)}
                      >
                        {marquageEnCours === n.id ? 'Ouverture...' : 'Ouvrir'}
                      </Button>
                    ) : !lue ? (
                      <Button
                        variant="secondary"
                        disabled={marquageEnCours === n.id}
                        onClick={() => void marquerCommeLu(n)}
                      >
                        {marquageEnCours === n.id ? 'Marquage...' : 'Marquer comme lue'}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
