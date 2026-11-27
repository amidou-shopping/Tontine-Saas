export type TourStatut = 'paye' | 'a_payer' | 'a_venir' | 'reception';

export interface Tour {
  numero: number;
  statut: TourStatut;
  date?: string;
  /** Libellé métier fourni par l'appelant, par exemple « Vous recevez ». */
  libelle?: string;
}

const AFFICHAGE: Record<TourStatut, { libelle: string; classes: string }> = {
  paye: {
    libelle: 'Payé',
    classes: 'border-black bg-black text-surface',
  },
  a_payer: {
    libelle: 'À payer',
    classes: 'border-accent bg-accent text-surface',
  },
  a_venir: {
    libelle: 'À venir',
    classes: 'border-line bg-canvas text-muted-canvas',
  },
  reception: {
    libelle: 'Vous recevez',
    classes: 'border-accent bg-surface text-accent',
  },
};

/** Une colonne par tour, défilement horizontal limité à ce composant. */
export default function TourCalendar({
  tours,
  legende = 'Calendrier des tours',
}: {
  tours: Tour[];
  legende?: string;
}) {
  if (tours.length === 0) {
    return <p className="text-body text-muted-canvas">Le calendrier n’est pas encore disponible.</p>;
  }

  return (
    <div className="overflow-x-auto pb-2" role="list" aria-label={legende}>
      <div className="flex min-w-max gap-3">
        {tours.map((tour) => {
          const affichage = AFFICHAGE[tour.statut];
          const libelle = tour.libelle ?? affichage.libelle;
          return (
            <div
              key={tour.numero}
              role="listitem"
              aria-label={`Tour ${tour.numero} : ${libelle}`}
              className={`flex min-w-tour flex-col gap-1 rounded-card border p-3 ${affichage.classes}`}
            >
              <span className="text-meta font-medium">Tour {tour.numero}</span>
              <span className="text-body font-semibold">{libelle}</span>
              {tour.date && <span className="text-meta tabular-nums">{tour.date}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
