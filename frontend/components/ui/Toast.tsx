'use client';

import { X } from 'lucide-react';

type Ton = 'succes' | 'danger' | 'information';

const AFFICHAGE: Record<Ton, { prefixe: string; classes: string }> = {
  succes: { prefixe: 'Succès', classes: 'border-success bg-success-surface text-success' },
  danger: { prefixe: 'Erreur', classes: 'border-danger bg-danger-surface text-danger' },
  information: { prefixe: 'Information', classes: 'border-line bg-surface text-ink' },
};

interface ToastProps {
  message: string;
  ton?: Ton;
  onFermer?: () => void;
}

/** Message flottant temporaire : le type est toujours indiqué en texte. */
export default function Toast({ message, ton = 'information', onFermer }: ToastProps) {
  const affichage = AFFICHAGE[ton];
  return (
    <div
      role={ton === 'danger' ? 'alert' : 'status'}
      className={`fixed bottom-24 right-4 z-floating flex max-w-popover items-start gap-3 rounded-card border p-4 text-body shadow-floating md:bottom-6 ${affichage.classes}`}
    >
      <div>
        <span className="font-semibold">{affichage.prefixe} : </span>
        <span>{message}</span>
      </div>
      {onFermer && (
        <button
          type="button"
          onClick={onFermer}
          aria-label="Fermer le message"
          className="-mt-1 -mr-1 flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-pill focus-ring"
        >
          <X className="h-icon-sm w-icon-sm" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
