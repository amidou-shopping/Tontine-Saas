/**
 * Helpers d’affichage partagés par l’accueil membre et le détail d’une tontine.
 * Aucune règle métier n’est calculée ici : les statuts des tours sont déduits
 * des champs renvoyés par l’API.
 */
import type { Tour, TourStatut } from '@/components/ui/TourCalendar';
import { enNombre } from './api';

const LIBELLES_TYPE: Record<string, string> = {
  COTISATION: 'Cotisation',
  RAMASSAGE: 'Ramassage',
  RETRAIT: 'Retrait',
  COMMISSION: 'Commission',
  REMBOURSEMENT: 'Remboursement',
};

/** Format imposé : 10 000 F, avec espace insécable. */
export function formaterMontant(montant: number) {
  return `${enNombre(montant).toLocaleString('fr-FR')}\u00A0F`;
}

export function formaterDate(date?: string) {
  if (!date) return 'Date à confirmer';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Date à confirmer';
  return parsed.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export function formaterDateComplete(date?: string) {
  if (!date) return 'Date à confirmer';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Date à confirmer';
  return parsed.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formaterDateHeure(date?: string) {
  if (!date) return 'Date à confirmer';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Date à confirmer';
  return parsed.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function libelleRole(role?: string) {
  const roles: Record<string, string> = {
    MEMBER: 'Membre',
    ADMIN_TONTINE: 'Admin tontine',
    SUPER_ADMIN: 'Admin',
  };
  return role ? (roles[role] ?? role) : 'Rôle inconnu';
}

export function libelleType(type: string) {
  return LIBELLES_TYPE[type] ?? type;
}

export interface TontinePourCalendrier {
  cycleActuel?: number;
  monTour?: number;
  statutCotisation?: string;
  prochainEcheance?: string;
}

/**
 * Construit la suite des tours à partir de l’ordre de passage connu.
 * Si le cycle ou le rang du membre manque, on ne fabrique aucun calendrier.
 */
export function construireTours(
  tontine: TontinePourCalendrier,
  membres: { ordrePassage: number }[] | null | undefined,
): Tour[] {
  if (!Array.isArray(membres) || membres.length === 0) return [];
  const cycle = tontine.cycleActuel;
  const monTour = tontine.monTour;
  if (typeof cycle !== 'number' || typeof monTour !== 'number') return [];

  return membres
    .slice()
    .sort((a, b) => a.ordrePassage - b.ordrePassage)
    .map((membre) => {
      let statut: TourStatut = 'a_venir';
      let libelle: string | undefined;

      if (membre.ordrePassage < cycle) {
        statut = 'paye';
      } else if (membre.ordrePassage === cycle) {
        if (monTour === cycle) {
          statut = 'reception';
          libelle = 'Vous recevez';
        } else if (tontine.statutCotisation === 'PAYE') {
          statut = 'paye';
        } else if (tontine.statutCotisation === undefined) {
          // Le détail de tontine ne dit pas si le membre a payé ce cycle.
          statut = 'a_venir';
          libelle = 'Tour en cours';
        } else {
          statut = 'a_payer';
        }
      } else if (membre.ordrePassage === monTour) {
        libelle = 'Votre tour';
      }

      return {
        numero: membre.ordrePassage,
        statut,
        libelle,
        date:
          membre.ordrePassage === cycle && tontine.prochainEcheance
            ? formaterDate(tontine.prochainEcheance)
            : undefined,
      };
    });
}
