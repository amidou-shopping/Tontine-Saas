import type { HTMLAttributes } from 'react';

/** Seul bloc en orange uni : cagnotte et tours liés à l'argent à recevoir/à payer. */
export default function AccentCard({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-accent bg-accent text-surface ${className}`}
      {...props}
    />
  );
}
