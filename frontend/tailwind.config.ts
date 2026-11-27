import type { Config } from 'tailwindcss';

/**
 * Source unique des tokens de design de Tontine.
 * Aucune couleur, taille, rayon ou ombre ne doit être déclaré ailleurs.
 * Les polices sont chargées par next/font dans app/layout.tsx et exposées
 * ici sous forme de variables CSS.
 *
 * `couleurs` et `mesures` sont exportés pour les rares rendus hors Tailwind
 * (graphiques Recharts), afin de garder une seule source de tokens.
 */
export const couleurs = {
  canvas: '#F3F2EF',
  surface: '#FFFFFF',
  line: '#E7E4DC',
  'line-strong': '#D8D3C7',
  ink: '#1A1917',
  muted: '#6F6A61',
  'muted-canvas': '#4A463F',
  black: '#111111',
  accent: '#C4481A',
  success: '#1F6B45',
  'success-surface': '#E3F1E9',
  warning: '#C98A2B',
  'warning-surface': '#FBF2E2',
  danger: '#B23A2E',
  'danger-surface': '#F8E8E5',
  rest: '#E7E4DC',
  overlay: 'rgba(17, 17, 17, 0.45)',
};

export const rayons = {
  card: '14px',
  control: '10px',
  pill: '9999px',
};

export const mesures = {
  hauteurGraphique: 280,
  tailleAxe: 16,
};

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: couleurs,
      fontFamily: {
        sans: ['var(--font-figtree)', 'system-ui', 'sans-serif'],
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
      },
      fontSize: {
        meta: ['0.875rem', { lineHeight: '1.35rem' }],
        body: ['1rem', { lineHeight: '1.5rem' }],
        lead: ['1.125rem', { lineHeight: '1.7rem' }],
        tile: ['2rem', { lineHeight: '2.4rem' }],
        section: ['1.875rem', { lineHeight: '2.25rem' }],
        greeting: ['2.75rem', { lineHeight: '3.15rem' }],
        figure: ['3.75rem', { lineHeight: '4.1rem' }],
      },
      borderRadius: rayons,
      spacing: {
        touch: '44px',
        control: '48px',
        icon: '20px',
        'icon-sm': '18px',
        chart: '280px',
      },
      maxWidth: {
        shell: '1200px',
        content: '880px',
        auth: '400px',
        modal: '480px',
        table: '640px',
        tour: '132px',
        popover: 'calc(100vw - 2rem)',
      },
      scrollMargin: {
        header: '96px',
      },
      boxShadow: {
        floating: '0 8px 24px rgba(17, 17, 17, 0.12)',
      },
      zIndex: {
        header: '40',
        floating: '50',
      },
    },
  },
  plugins: [],
};

export default config;
