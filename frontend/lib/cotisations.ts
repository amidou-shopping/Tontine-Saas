/**
 * Liste des cotisations à payer construite à partir de `/api/member/tontines`.
 *
 * Cette API ne renvoie qu'UN arriéré par tontine (le tour précédent) et un
 * statut pour le tour courant : on affiche donc ce qu'elle fournit déjà, sans
 * inventer de cotisation. La liste complète des tours impayés est à demander
 * au backend (voir le rapport final « Données à demander au backend »).
 *
 * Aucune règle métier n'est calculée ici : le backend reste seul responsable
 * de refuser un paiement si un tour plus ancien de la même tontine est dû.
 */
import { enNombre } from './api';

export interface ArriereResume {
  cycle: number;
  cotisationDue?: number | string;
  amende?: number | string | null;
  montantTotal?: number | string;
  dateEcheance?: string;
}

export interface TontineAvecCotisation {
  id: string;
  nom: string;
  montantCotisation: number | string;
  cycleActuel?: number;
  statutCotisation: string;
  arriere?: ArriereResume | null;
  /** Échéance « prochaine » calculée par l'API (décalée dans le futur). */
  prochainEcheance?: string;
}

export type StatutCotisationDue = 'EN_RETARD' | 'A_PAYER';

export interface CotisationDue {
  /** Clé stable : une tontine + un tour. */
  id: string;
  tontineId: string;
  tontineNom: string;
  cycle: number;
  /** Dernier tour connu de la tontine, pour l'affichage « tour X sur N ». */
  cycleActuel: number;
  dateEcheance?: string;
  /** Cotisation seule, hors amende. */
  montant: number;
  amende: number;
  statut: StatutCotisationDue;
}

export function extraireCotisationsDues(tontines: TontineAvecCotisation[]): CotisationDue[] {
  const cotisations: CotisationDue[] = [];

  for (const tontine of tontines) {
    const cycleActuel = tontine.cycleActuel ?? tontine.arriere?.cycle ?? 1;

    if (tontine.arriere) {
      const amende = enNombre(tontine.arriere.amende);
      cotisations.push({
        id: `${tontine.id}-${tontine.arriere.cycle}`,
        tontineId: tontine.id,
        tontineNom: tontine.nom,
        cycle: tontine.arriere.cycle,
        cycleActuel,
        dateEcheance: tontine.arriere.dateEcheance,
        montant:
          tontine.arriere.cotisationDue !== undefined
            ? enNombre(tontine.arriere.cotisationDue)
            : enNombre(tontine.arriere.montantTotal) - amende,
        amende,
        statut: 'EN_RETARD',
      });
    }

    // Quand un arriéré existe, l'API remplace le statut du tour courant par
    // ARRIERE : on ne sait donc pas s'il est déjà payé (donnée à demander).
    if (tontine.statutCotisation !== 'PAYE') {
      cotisations.push({
        id: `${tontine.id}-${cycleActuel}`,
        tontineId: tontine.id,
        tontineNom: tontine.nom,
        cycle: cycleActuel,
        cycleActuel,
        dateEcheance: tontine.prochainEcheance,
        montant: enNombre(tontine.montantCotisation),
        amende: 0,
        statut: tontine.statutCotisation === 'EN_RETARD' ? 'EN_RETARD' : 'A_PAYER',
      });
    }
  }

  return cotisations.sort((a, b) => {
    const dateA = a.dateEcheance ?? '9999-12-31';
    const dateB = b.dateEcheance ?? '9999-12-31';
    return (
      dateA.localeCompare(dateB) ||
      a.cycle - b.cycle ||
      a.tontineNom.localeCompare(b.tontineNom) ||
      a.id.localeCompare(b.id)
    );
  });
}

/** Somme affichée en haut du bloc : cotisations + amendes éventuelles. */
export function totalCotisationsDues(cotisations: CotisationDue[]): number {
  return cotisations.reduce((total, cotisation) => total + cotisation.montant + cotisation.amende, 0);
}
