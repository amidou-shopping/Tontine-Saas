/**
 * Jours de cotisation autorisés (cohérent avec l'enum Prisma `JourSemaine`).
 * Les échéances sont calculées en UTC côté backend ; ce fichier ne contient
 * que des libellés et du texte d'aide pour les formulaires.
 */

export const JOURS_SEMAINE = [
  'LUNDI',
  'MARDI',
  'MERCREDI',
  'JEUDI',
  'VENDREDI',
  'SAMEDI',
  'DIMANCHE',
] as const;

export type JourSemaine = (typeof JOURS_SEMAINE)[number];

export const LIBELLES_JOURS: Record<JourSemaine, string> = {
  LUNDI: 'lundi',
  MARDI: 'mardi',
  MERCREDI: 'mercredi',
  JEUDI: 'jeudi',
  VENDREDI: 'vendredi',
  SAMEDI: 'samedi',
  DIMANCHE: 'dimanche',
};

/** Texte d'aide affiché sous le champ « nombre de membres ». */
export function texteDuree(nombreMembres: string | number, jour: JourSemaine): string {
  const n = Number(nombreMembres);
  const total = Number.isInteger(n) && n > 0 ? n : 0;
  return `Durée : ${total} semaines (${total} cotisations, une chaque ${LIBELLES_JOURS[jour]})`;
}
