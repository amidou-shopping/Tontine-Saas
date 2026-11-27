'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  ouvert: boolean;
  onFermer: () => void;
  titre: string;
  children: ReactNode;
}

/**
 * Premier champ éditable du contenu, sinon la boîte elle-même.
 * Les boutons de fermeture et d'action ne doivent jamais voler le focus.
 */
const SELECTEUR_PREMIER_CHAMP = [
  'input:not([type="hidden"]):not([disabled]):not([readonly])',
  'textarea:not([disabled]):not([readonly])',
  'select:not([disabled])',
  '[contenteditable="true"]',
].join(', ');

export default function Modal({ ouvert, onFermer, titre, children }: ModalProps) {
  const titreId = useId();
  const boiteRef = useRef<HTMLDivElement>(null);
  const onFermerRef = useRef(onFermer);

  // `onFermer` est le plus souvent une fonction inline recréée à chaque frappe.
  // On la lit via une ref pour que l'effet d'ouverture ne dépende QUE de `ouvert`.
  useEffect(() => {
    onFermerRef.current = onFermer;
  }, [onFermer]);

  useEffect(() => {
    if (!ouvert) return;

    const elementPrecedent = document.activeElement as HTMLElement | null;
    const boite = boiteRef.current;
    const premierChamp = boite?.querySelector<HTMLElement>(SELECTEUR_PREMIER_CHAMP);
    (premierChamp ?? boite)?.focus();

    function fermerAvecEchap(event: KeyboardEvent) {
      if (event.key === 'Escape') onFermerRef.current();
    }

    document.addEventListener('keydown', fermerAvecEchap);

    return () => {
      document.removeEventListener('keydown', fermerAvecEchap);
      if (elementPrecedent?.isConnected && typeof elementPrecedent.focus === 'function') {
        elementPrecedent.focus();
      }
    };
  }, [ouvert]);

  if (!ouvert) return null;

  return (
    <div
      className="fixed inset-0 z-floating flex items-center justify-center bg-overlay p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onFermerRef.current();
      }}
    >
      <div
        ref={boiteRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        tabIndex={-1}
        className="max-h-full w-full max-w-modal overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-floating focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titreId} className="font-display text-section font-semibold text-ink">
            {titre}
          </h2>
          <button
            type="button"
            onClick={() => onFermerRef.current()}
            aria-label="Fermer la fenêtre"
            className="flex min-h-touch min-w-touch items-center justify-center rounded-pill text-ink hover:bg-canvas focus-ring"
          >
            <X className="h-icon w-icon" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
