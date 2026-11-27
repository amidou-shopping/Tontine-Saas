'use client';

import { useState, type ReactNode } from 'react';
import Card from './Card';

interface AuthCardProps {
  titre: string;
  description?: string;
  children: ReactNode;
  lien?: ReactNode;
}

/**
 * Cadre commun aux écrans publics : carte de 400 px centrée sur le fond gris,
 * nom du produit en Fraunces, aucun élément flottant.
 */
export default function AuthCard({ titre, description, children, lien }: AuthCardProps) {
  const [aideOuverte, setAideOuverte] = useState(false);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-auth">
        <p className="mb-6 text-center font-display text-section font-semibold text-ink">Tontine</p>

        <Card className="p-6">
          <h1 className="font-display text-section font-semibold text-ink">{titre}</h1>
          {description && <p className="mt-2 text-body text-muted-canvas">{description}</p>}
          <div className="mt-6">{children}</div>
        </Card>

        {lien && <div className="mt-5 text-center text-body text-muted-canvas">{lien}</div>}

        <footer className="mt-8 text-center">
          <button
            type="button"
            onClick={() => setAideOuverte((etat) => !etat)}
            aria-expanded={aideOuverte}
            className="min-h-touch rounded-pill px-4 text-meta text-muted-canvas hover:bg-canvas focus-ring"
          >
            Aide
          </button>
          {aideOuverte && (
            <p className="mt-2 text-meta text-muted-canvas">
              Connectez-vous pour accéder aux contacts du support.
            </p>
          )}
        </footer>
      </div>
    </main>
  );
}
