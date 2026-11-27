'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { enNombre } from '@/lib/api';
import { formaterDateComplete, formaterMontant } from '@/lib/affichage';
import Card from '@/components/ui/Card';
import { couleurs, mesures, rayons } from '@/tailwind.config';

interface PointRevenu {
  date: string;
  commissions: number;
  abonnements: number;
}

export default function RevenueChart({ data }: { data: PointRevenu[] }) {
  return (
    <Card className="p-5">
      <h2 className="font-display text-section font-semibold text-ink">
        Évolution du chiffre d’affaires
      </h2>
      {data.length === 0 ? (
        <p className="mt-2 text-body text-muted-canvas">
          L’historique des revenus n’est pas disponible pour le moment.
        </p>
      ) : (
        <>
          <div className="mt-5 h-chart">
            <ResponsiveContainer width="100%" height={mesures.hauteurGraphique}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke={couleurs.line} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: couleurs['muted-canvas'], fontSize: mesures.tailleAxe }}
                />
                <YAxis
                  tick={{ fill: couleurs['muted-canvas'], fontSize: mesures.tailleAxe }}
                  tickFormatter={(valeur) => `${Math.round(enNombre(valeur) / 1000)} k`}
                />
                <Tooltip
                  cursor={{ stroke: couleurs.line }}
                  contentStyle={{
                    border: `1px solid ${couleurs.line}`,
                    borderRadius: rayons.card,
                    backgroundColor: couleurs.surface,
                    color: couleurs.ink,
                  }}
                  labelStyle={{ color: couleurs.ink }}
                  labelFormatter={(label) => formaterDateComplete(String(label))}
                  formatter={(value: number) => formaterMontant(enNombre(value))}
                />
                <Line
                  type="monotone"
                  dataKey="commissions"
                  stroke={couleurs.ink}
                  strokeWidth={2}
                  name="Commissions"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="abonnements"
                  stroke={couleurs.success}
                  strokeWidth={2}
                  name="Abonnements"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 text-meta text-muted-canvas">
            Séries affichées : commissions, abonnements. Survolez le graphique pour lire les montants.
          </p>
        </>
      )}
    </Card>
  );
}
