import * as crypto from 'crypto';

const MAX_AGE_SECONDS = 5 * 60;

/**
 * Vérifie une signature HMAC-SHA256 calculée sur le corps BRUT de la requête
 * (et non sur un JSON.stringify dont l'ordre des clés peut différer).
 *
 * Formats de header acceptés : `<hex>`, `sha256=<hex>`, `t=<secs>,v1=<hex>`,
 * `v1=<hex>` — soit les conventions les plus courantes des providers.
 */
export function verifierHmacSha256(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !signatureHeader) return false;

  const timestamp = extraireTimestamp(signatureHeader);
  if (timestamp !== null && estAncien(timestamp)) return false;

  const attendu = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return extraireSignatures(signatureHeader).some((candidat) => comparerHex(candidat, attendu));
}

/** Retourne l'en-tête de signature, quel que soit le nom choisi par le provider. */
export function trouverSignatureHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const noms = ['x-signature', 'wave-signature', 'x-paytech-signature', 'signature'];
  for (const nom of noms) {
    const valeur = headers[nom];
    if (typeof valeur === 'string') return valeur;
    if (Array.isArray(valeur) && typeof valeur[0] === 'string') return valeur[0];
  }
  return undefined;
}

function extraireSignatures(header: string): string[] {
  const correspondances = header.match(/(?:sha256=|v1=)?[a-f0-9]{64}/gi) ?? [];
  return correspondances.map((valeur) => valeur.replace(/^(sha256=|v1=)/i, '').toLowerCase());
}

function extraireTimestamp(header: string): number | null {
  const correspondance = header.match(/(?:^|,)t=(\d{10,13})(?:,|$)/);
  if (!correspondance) return null;
  const brut = Number(correspondance[1]);
  return brut > 10_000_000_000 ? Math.floor(brut / 1000) : brut; // ms -> s
}

function estAncien(timestampSecondes: number): boolean {
  return Math.abs(Math.floor(Date.now() / 1000) - timestampSecondes) > MAX_AGE_SECONDS;
}

function comparerHex(fourni: string, attendu: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(fourni)) return false; // gère aussi les longueurs différentes
  return crypto.timingSafeEqual(Buffer.from(fourni, 'hex'), Buffer.from(attendu, 'hex'));
}
