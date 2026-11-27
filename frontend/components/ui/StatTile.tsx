import Card from './Card';

interface StatTileProps {
  libelle: string;
  valeur: string;
  detail?: string;
  ton?: 'neutre' | 'succes' | 'danger';
}

const TONS = {
  neutre: 'text-ink',
  succes: 'text-success',
  danger: 'text-danger',
} as const;

export default function StatTile({ libelle, valeur, detail, ton = 'neutre' }: StatTileProps) {
  return (
    <Card className="p-5">
      <p className="text-body text-muted-canvas">{libelle}</p>
      <p className={`mt-2 font-display text-tile font-semibold tabular-nums ${TONS[ton]}`}>
        {valeur}
      </p>
      {detail && <p className="mt-2 text-meta text-muted-canvas">{detail}</p>}
    </Card>
  );
}
