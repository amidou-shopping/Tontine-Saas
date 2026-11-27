import type { ReactNode } from 'react';
import Card from './Card';

interface EmptyStateProps {
  titre: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ titre, description, action }: EmptyStateProps) {
  return (
    <Card className="p-6 text-center">
      <h2 className="font-display text-section font-semibold text-ink">{titre}</h2>
      {description && <p className="mx-auto mt-2 max-w-content text-body text-muted-canvas">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Card>
  );
}
