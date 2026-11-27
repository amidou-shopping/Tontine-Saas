import type { HTMLAttributes } from 'react';

/** Carte blanche sobre : pas d'ombre, bordure fine, rayon 14 px. */
export default function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-card border border-line bg-surface ${className}`} {...props} />;
}
