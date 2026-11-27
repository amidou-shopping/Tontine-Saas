import type { ReactNode } from 'react';
import Card from './Card';

export interface Column<T> {
  key: string;
  header: string;
  render: (ligne: T) => ReactNode;
  align?: 'left' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (ligne: T) => string;
  caption: string;
  vide?: string;
}

/** Tableau sur grand écran, cartes empilées et lisibles sur téléphone. */
export default function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  vide = 'Aucune donnée à afficher.',
}: DataTableProps<T>) {
  if (rows.length === 0) return <Card className="p-6 text-body text-muted-canvas">{vide}</Card>;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-table border-collapse text-body">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-left text-meta text-muted-canvas">
              {columns.map((colonne) => (
                <th
                  key={colonne.key}
                  scope="col"
                  className={`px-4 py-3 font-medium ${colonne.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {colonne.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((ligne) => (
              <tr key={getRowKey(ligne)} className="border-b border-line last:border-0">
                {columns.map((colonne) => (
                  <td
                    key={colonne.key}
                    className={`px-4 py-3 ${colonne.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {colonne.render(ligne)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((ligne) => (
          <Card key={getRowKey(ligne)} className="p-4">
            <dl className="space-y-2">
              {columns.map((colonne) => (
                <div key={colonne.key} className="flex items-start justify-between gap-4">
                  <dt className="text-meta text-muted-canvas">{colonne.header}</dt>
                  <dd className="text-right text-body text-ink">{colonne.render(ligne)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
    </>
  );
}
