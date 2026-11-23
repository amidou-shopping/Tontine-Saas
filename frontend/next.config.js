/** @type {import('next').NextConfig} */
// On retire les slashs finaux pour éviter les destinations en double slash
// (ex: http://localhost:3001//api/...) lorsque API_URL est mal renseignée.
const API_URL = (process.env.API_URL || 'http://localhost:3001').replace(/\/+$/, '');

const nextConfig = {
  // Évite que Turbopack remonte jusqu'au répertoire home pour trouver le lockfile
  // (avertissement « ignored package-lock.json » quand le projet est sous C:\Users\...).
  turbopack: {
    root: __dirname,
  },

  // Toutes les requêtes /api/* faites par le frontend (ex: fetch('/api/member/tontines'))
  // sont transparentement redirigées vers l'API NestJS. Ça évite les soucis de
  // CORS/cookies en dev et simplifie le code des composants clients.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
