/**
 * lib/api.ts — Petit wrapper autour de fetch() qui attache automatiquement
 * le JWT stocké après connexion. Toutes les requêtes passent par /api/*,
 * redirigé vers l'API NestJS via les rewrites de next.config.js.
 *
 * Contient aussi quelques utilitaires partagés :
 *  - enNombre() : conversion des Decimal sérialisés en chaînes par Prisma ;
 *  - extraireMessageErreur() : lecture des messages d'erreur (chaîne ou
 *    tableau de validations class-validator) ;
 *  - getProfilServeur() : récupération du rôle depuis l'API (et non du JWT).
 */

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export function setSession(token: string, user: unknown) {
  localStorage.setItem('accessToken', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
}

export function getCurrentUser<T = any>(): T | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  // Le contenu de localStorage peut avoir été corrompu : on ne doit jamais
  // laisser un JSON.parse() faire planter le rendu d'une page.
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch (err) {
    console.warn('Session locale illisible, suppression de l’utilisateur.', err);
    localStorage.removeItem('user');
    return null;
  }
}

/** Identifiant temporaire de l'utilisateur en attente de vérification OTP. */
export function setOtpUserId(userId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('otpUserId', userId);
}

export function getOtpUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('otpUserId');
}

export function clearOtpUserId() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('otpUserId');
}

/**
 * Prisma renvoie les champs Decimal sous forme de chaînes JSON ("5000").
 * Cette fonction garantit un number utilisable avec toLocaleString('fr-FR').
 */
export function enNombre(valeur: unknown): number {
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : 0;
  if (typeof valeur === 'string' && valeur.trim() !== '') {
    const nombre = Number(valeur);
    return Number.isFinite(nombre) ? nombre : 0;
  }
  return 0;
}

/** Collecte récursivement les messages (chaîne, tableau, erreurs class-validator). */
function collecterMessages(valeur: unknown): string[] {
  if (typeof valeur === 'string') {
    const texte = valeur.trim();
    return texte ? [texte] : [];
  }
  if (Array.isArray(valeur)) {
    return [...new Set(valeur.flatMap(collecterMessages))];
  }
  if (valeur && typeof valeur === 'object') {
    const objet = valeur as Record<string, unknown>;
    if (objet.message !== undefined) return collecterMessages(objet.message);
    if (objet.errors !== undefined) return collecterMessages(objet.errors);
    if (objet.constraints !== undefined) return collecterMessages(objet.constraints);
    return Object.values(objet).flatMap(collecterMessages);
  }
  return [];
}

/**
 * Extrait un message lisible d'une réponse d'erreur API.
 * Gère : { message: '...' }, { message: ['...', '...'] } et les tableaux
 * d'erreurs class-validator ({ property, constraints: { ... } }).
 */
export function extraireMessageErreur(payload: unknown, fallback = 'Une erreur est survenue.'): string {
  const messages = collecterMessages(payload);
  return messages.length > 0 ? messages.join(' · ') : fallback;
}

/** Déconnecte l'utilisateur et ramène à la connexion en cas de 401. */
function traiter401() {
  if (typeof window === 'undefined') return;
  clearSession();
  if (window.location.pathname === '/login') return;
  window.location.assign('/login');
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const reponse = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Les routes /api/auth/* sont publiques : un 401 sur login ou verify-otp
  // doit rester géré localement pour afficher le bon message à l'utilisateur.
  if (reponse.status === 401 && !path.startsWith('/api/auth/')) {
    traiter401();
  }

  return reponse;
}

export interface ProfilServeur {
  id: string;
  role: string;
  prenom?: string;
  nom?: string;
  [cle: string]: unknown;
}

/**
 * Charge le rôle depuis le serveur. Le rôle lu dans localStorage n'est qu'un
 * indicateur d'affichage : il ne doit jamais servir à autoriser une page.
 */
export async function getProfilServeur<T = ProfilServeur>(): Promise<T | null> {
  if (typeof window === 'undefined' || !getToken()) return null;
  try {
    const res = await apiFetch('/api/member/profil');
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.error(err);
    return null;
  }
}
