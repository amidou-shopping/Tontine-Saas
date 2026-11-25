'use client';

import { useState } from 'react';
import { apiFetch, extraireMessageErreur, getCurrentUser } from '@/lib/api';

interface UtilisateurAdmin {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  role: string;
  estPrincipal?: boolean;
  isBlocked: boolean;
}

export default function UsersTable({ initialUsers }: { initialUsers: UtilisateurAdmin[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [chargementId, setChargementId] = useState<string | null>(null);
  const acteur = getCurrentUser<{ id?: string; estPrincipal?: boolean }>();
  const acteurId = acteur?.id;
  const acteurEstPrincipal = acteur?.estPrincipal === true;

  async function toggleBlocage(user: UtilisateurAdmin) {
    setChargementId(user.id);
    try {
      const action = user.isBlocked ? 'unblock' : 'block';
      const res = await apiFetch(`/api/admin/users/${user.id}/${action}`, {
        method: 'PATCH',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extraireMessageErreur(payload, 'Action impossible pour le moment.'));
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isBlocked: !u.isBlocked } : u)),
      );
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Impossible d'effectuer cette action pour le moment.");
    } finally {
      setChargementId(null);
    }
  }

  // Aucune promotion SUPER_ADMIN côté interface : création réservée au seed/CLI.

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-3">Nom</th>
            <th className="text-left px-4 py-3">Contact</th>
            <th className="text-left px-4 py-3">Rôle</th>
            <th className="text-left px-4 py-3">Statut</th>
            <th className="text-right px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3 font-medium text-gray-900">{u.prenom} {u.nom}</td>
              <td className="px-4 py-3 text-gray-500">
                <div>{u.email}</div>
                <div className="text-xs">{u.telephone}</div>
              </td>
              <td className="px-4 py-3 text-gray-500">
                {u.role}
                {u.estPrincipal && (
                  <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                    Principal
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    u.isBlocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}
                >
                  {u.isBlocked ? 'Bloqué' : 'Actif'}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  {u.estPrincipal || u.id === acteurId ||
                  (u.role === 'SUPER_ADMIN' && !acteurEstPrincipal) ? (
                    <span className="text-[11px] text-gray-400">
                      {u.estPrincipal
                        ? 'Compte protégé'
                        : u.id === acteurId
                          ? 'Vous-même'
                          : 'Réservé au principal'}
                    </span>
                  ) : (
                    <button
                      onClick={() => toggleBlocage(u)}
                      disabled={chargementId === u.id}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 ${
                        u.isBlocked ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                      }`}
                    >
                      {chargementId === u.id ? '...' : u.isBlocked ? 'Débloquer' : 'Bloquer'}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
