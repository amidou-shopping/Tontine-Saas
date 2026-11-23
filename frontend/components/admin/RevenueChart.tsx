'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { enNombre } from '@/lib/api';

interface PointRevenu {
  date: string;     // ex: "2026-08-01"
  commissions: number;
  abonnements: number;
}

export default function RevenueChart({ data }: { data: PointRevenu[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Évolution du chiffre d'affaires</h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v / 1000}k`} />
          <Tooltip
            formatter={(value: number) => `${enNombre(value).toLocaleString('fr-FR')} FCFA`}
            labelStyle={{ color: '#111827' }}
          />
          <Line type="monotone" dataKey="commissions" stroke="#0ea5e9" strokeWidth={2} name="Commissions" dot={false} />
          <Line type="monotone" dataKey="abonnements" stroke="#f97316" strokeWidth={2} name="Abonnements" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
