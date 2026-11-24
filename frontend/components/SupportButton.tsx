'use client';

/**
 * SupportButton — bouton flottant d'accès aux contacts support.
 *
 * Visible uniquement pour un utilisateur connecté (contrôle d'affichage ;
 * l'autorisation réelle est assurée par le JwtAuthGuard de l'API). Les liens
 * WhatsApp et le message prérempli sont construits côté serveur.
 */
import { useEffect, useState } from 'react';
import { apiFetch, extraireMessageErreur, getToken } from '@/lib/api';

interface ContactSupport {
  nom: string;
  telephone: string;
  lienWhatsApp: string;
}

export default function SupportButton() {
  const [visible, setVisible] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [contacts, setContacts] = useState<ContactSupport[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

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
      .catch((err: any) => {
        if (actif) setErreur(err.message || 'Contacts indisponibles.');
      });

    return () => {
      actif = false;
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {ouvert && (
        <div className="w-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Besoin d’aide ?</h2>
            <button
              onClick={() => setOuvert(false)}
              aria-label="Fermer le support"
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          </div>

          {erreur && <p className="text-xs text-red-600">{erreur}</p>}

          {!erreur && contacts.length === 0 && (
            <p className="text-xs text-gray-500">Aucun contact support configuré.</p>
          )}

          {contacts.map((contact) => (
            <div
              key={contact.lienWhatsApp}
              className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">{contact.nom}</p>
                <p className="text-xs text-gray-500" dir="ltr">
                  +{contact.telephone}
                </p>
              </div>
              <a
                href={contact.lienWhatsApp}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg bg-green-600 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-green-700"
              >
                Écrire sur WhatsApp
              </a>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setOuvert((etat) => !etat)}
        aria-label="Ouvrir les contacts support"
        className="rounded-full bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-sky-700"
      >
        {ouvert ? 'Fermer' : 'Aide'}
      </button>
    </div>
  );
}
