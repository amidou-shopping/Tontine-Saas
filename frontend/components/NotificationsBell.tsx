'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
          if (actif) setErreur(extraireMessageErreur(data, 'Impossible de charger les notifications.'));
          return;
        }
        const payload = (await res.json().catch(() => ({}))) ?? {};
        const liste: unknown = Array.isArray(payload) ? payload : payload.data ?? [];
        if (actif) setNotifications(Array.isArray(liste) ? (liste as NotificationMembre[]) : []);
      } catch (err) {
        console.error(err);
        if (actif) setErreur('Impossible de charger les notifications.');
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
        setErreur(extraireMessageErreur(data, 'Impossible de marquer cette notification comme lue.'));
        return false;
      }
      // Mise à jour locale immédiate : inutile de recharger toute la liste.
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id
            ? { ...n, isLu: true, lu: true, estLu: true }
            : n,
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
        className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        <span aria-hidden="true" className="text-lg leading-none">🔔</span>
        {nonLues > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-600 px-1 text-[10px] font-bold leading-[18px] text-white">
            {nonLues}
          </span>
        )}
      </button>

      {ouverte && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            <button
              type="button"
              onClick={() => setTentative((n) => n + 1)}
              className="text-xs text-sky-600 hover:underline"
            >
              Actualiser
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && <p className="px-4 py-6 text-center text-sm text-gray-500">Chargement...</p>}

            {erreur && !loading && (
              <div className="px-4 py-4 text-sm text-red-700">
                <p>{erreur}</p>
                <button
                  type="button"
                  onClick={() => setTentative((n) => n + 1)}
                  className="mt-2 text-xs font-semibold underline"
                >
                  Réessayer
                </button>
              </div>
            )}

            {!loading && !erreur && notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-500">
                Aucune notification pour le moment.
              </p>
            )}

            {!loading && !erreur && notifications.map((n) => {
              const lue = estLue(n);
              const contenu = (
                <>
                  {n.titre && <p className="text-sm font-semibold text-gray-900">{n.titre}</p>}
                  <p className="text-xs text-gray-600 whitespace-pre-line">
                    {n.message ?? n.contenu ?? ''}
                  </p>
                </>
              );
              return (
                <div
                  key={n.id}
                  className={`border-b border-gray-100 px-4 py-3 last:border-0 ${lue ? '' : 'bg-sky-50/50'}`}
                >
                  {n.lien ? (
                    <button
                      type="button"
                      disabled={marquageEnCours === n.id}
                      onClick={() => ouvrirNotification(n)}
                      className="w-full text-left disabled:opacity-60"
                    >
                      {contenu}
                    </button>
                  ) : (
                    <div>{contenu}</div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-400">
                      {n.createdAt ? new Date(n.createdAt).toLocaleString('fr-FR') : ''}
                    </span>
                    {n.lien ? (
                      <span className="text-[11px] font-semibold text-sky-600">
                        {marquageEnCours === n.id ? 'Ouverture...' : 'Ouvrir →'}
                      </span>
                    ) : !lue ? (
                      <button
                        type="button"
                        disabled={marquageEnCours === n.id}
                        onClick={() => marquerCommeLu(n)}
                        className="text-[11px] font-semibold text-sky-600 hover:underline disabled:opacity-40"
                      >
                        {marquageEnCours === n.id ? '...' : 'Marquer comme lu'}
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
