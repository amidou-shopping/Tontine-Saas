/**
 * Phase 5 — Contacts du support.
 *
 * Les numéros sont configurés par variables d'environnement (jamais codés en
 * dur, jamais de numéro réel dans le dépôt). Format attendu : international
 * SANS le '+' (ex. 221000000000). Un '+' saisi par erreur est toléré et retiré.
 * Les valeurs invalides sont ignorées pour ne jamais produire un lien cassé.
 */

export interface ContactSupport {
  nom: string;
  telephone: string;
  lienWhatsApp: string;
}

/** Nettoie et valide un numéro international (E.164 sans le '+'). */
export function normaliserNumeroSupport(valeur: string | undefined): string | null {
  const brut = valeur?.trim();
  if (!brut) return null;
  const sansPlus = brut.startsWith('+') ? brut.slice(1) : brut;
  const numero = sansPlus.replace(/[\s.\-()]/g, '');
  return /^[1-9]\d{7,14}$/.test(numero) ? numero : null;
}

/**
 * Construit les contacts support et leurs liens WhatsApp. Le message est
 * prérempli avec l'identifiant de l'utilisateur connecté (issu du JWT), puis
 * encodé une seule fois côté serveur.
 */
export function lireContactsSupport(identifiantUtilisateur: string): ContactSupport[] {
  const message =
    "Bonjour, je sollicite l'assistance de la plateforme Tontine SaaS. " +
    `Mon identifiant utilisateur est : ${identifiantUtilisateur}.`;

  const contacts: ContactSupport[] = [];
  for (let index = 1; index <= 3; index++) {
    const telephone = normaliserNumeroSupport(process.env[`SUPPORT_${index}_PHONE`]);
    if (!telephone) continue;
    const nom = process.env[`SUPPORT_${index}_NAME`]?.trim() || `Support ${index}`;
    contacts.push({
      nom,
      telephone,
      lienWhatsApp: `https://wa.me/${telephone}?text=${encodeURIComponent(message)}`,
    });
  }
  return contacts;
}
