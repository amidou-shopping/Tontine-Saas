'use client';

/**
 * SupportButton — accès aux contacts support (données fournies par l'API).
 * `variante="header"` : bouton « Aide » dans l'en-tête, masqué sur téléphone.
 * `variante="section"` : bouton secondaire « Contacter le support » pour un pied de page.
 * Aucun bouton flottant permanent.
 */
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch, extraireMessageErreur, getToken } from '@/lib/api';

interface ContactSupport {
  nom: string;
  telephone: string;
  lienWhatsApp: string;
}

export default function SupportButton({ variante = 'section' }: { variante?: 'header' | 'section' }) {
  const [visible, setVisible] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [contacts, setContacts] = useState<ContactSupport[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // État initial identique serveur/client pour éviter une erreur d'hydratation.
    if (!getToken()) return;
    setVisible(true);

    let actif = true;
    apiFetch('/api/member/support-contacts')
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(extraireMessageErreur(payload, 'Contacts indisponibles.'));
        }
        if (actif) setContacts((payload.contacts ?? []) as ContactSupport[]);
      })
      .catch((err: Error) => {
        if (actif) setErreur(`${err.message || 'Contacts indisponibles.'} Réessayez plus tard.`);
      });

    return () => {
      actif = false;
    };
  }, []);

  useEffect(() => {
    if (!ouvert) return;
    function fermerAuClic(event: MouseEvent) {
      if (conteneur.current && !conteneur.current.contains(event.target as Node)) {
        setOuvert(false);
      }
    }
    function fermerAvecEchap(event: KeyboardEvent) {
      if (event.key === 'Escape') setOuvert(false);
    }
    document.addEventListener('mousedown', fermerAuClic);
    document.addEventListener('keydown', fermerAvecEchap);
    return () => {
      document.removeEventListener('mousedown', fermerAuClic);
      document.removeEventListener('keydown', fermerAvecEchap);
    };
  }, [ouvert]);

  if (!visible) return null;

  const classeDeclencheur =
    variante === 'header'
      ? 'hidden min-h-touch items-center rounded-pill border border-line-strong bg-surface px-4 text-body font-semibold text-ink hover:bg-canvas focus-ring lg:inline-flex'
      : 'inline-flex min-h-control w-full items-center justify-center rounded-pill border border-line-strong bg-surface px-5 text-body font-semibold text-ink hover:bg-canvas focus-ring';

  return (
    <div className="relative" ref={conteneur}>
      <button
        type="button"
        onClick={() => setOuvert((etat) => !etat)}
        aria-expanded={ouvert}
        className={classeDeclencheur}
      >
        {variante === 'header' ? 'Aide' : 'Contacter le support'}
      </button>

      {ouvert && (
        <div
          className={`fixed z-floating w-80 max-w-popover rounded-card border border-line bg-surface p-4 shadow-floating ${
            variante === 'header' ? 'right-4 top-20' : 'bottom-24 right-4 md:bottom-6'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-display text-section font-semibold text-ink">Besoin d’aide ?</h2>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              aria-label="Fermer les contacts support"
              className="flex min-h-touch min-w-touch items-center justify-center rounded-pill text-ink hover:bg-canvas focus-ring"
            >
              <X className="h-icon w-icon" aria-hidden="true" />
            </button>
          </div>

          {erreur && (
            <p role="alert" className="mt-3 text-meta text-danger">
              {erreur}
            </p>
          )}

          {!erreur && contacts.length === 0 && (
            <p className="mt-3 text-body text-muted-canvas">Aucun contact support configuré.</p>
          )}

          <div className="mt-3 space-y-3">
            {contacts.map((contact) => (
              <div key={contact.lienWhatsApp} className="rounded-card border border-line bg-canvas p-3">
                <p className="text-body font-semibold text-ink">{contact.nom}</p>
                <p className="text-meta text-muted-canvas" dir="ltr">
                  {contact.telephone}
                </p>
                <a
                  href={contact.lienWhatsApp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-control w-full items-center justify-center rounded-pill border border-black bg-black px-4 text-body font-semibold text-surface hover:bg-ink focus-ring"
                >
                  Écrire sur WhatsApp
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
