'use client';

import { useState } from 'react';
import { apiFetch, extraireMessageErreur } from '@/lib/api';

interface UtilisateurAdmin {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  role: string;
  isBlocked: boolean;
}

export default function UsersTable({ initialUsers }: { initialUsers: UtilisateurAdmin[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [chargementId, setChargementId] = useState<string | null>(null);

  async function toggleBlocage(user: UtilisateurAdmin) {
    setChargementId(user.id);
    try {
      const action = user.isBlocked ? 'unblock' : 'block';
      const res = await apiFetch(`/api/admin/users/${user.id}/${action}`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error('Action impossible');

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isBlocked: !u.isBlocked } : u)),
      );
    } catch (err) {
      console.error(err);
      alert("Impossible d'effectuer cette action pour le moment.");
    } finally {
      setChargementId(null);
    }
  }

  /**
   * Phase 4 : seule une route back-office (réservée aux SUPER_ADMIN) peut
   * élever un rôle. Le plafond est vérifié côté serveur dans une transaction.
   */
  async function promouvoirSuperAdmin(user: UtilisateurAdmin) {
    if (
      !confirm(
        `Promouvoir ${user.prenom} ${user.nom} au rôle SUPER_ADMIN ? Le nombre maximum de Super-Admins est vérifié côté serveur.`,
      )
    )
      return;
    setChargementId(user.id);
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}/promouvoir-super-admin`, {
        method: 'POST',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(extraireMessageErreur(payload, 'Promotion impossible pour le moment.'));
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: 'SUPER_ADMIN' } : u)),
      );
      alert(extraireMessageErreur(payload, 'L’utilisateur est désormais Super-Admin.'));
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Promotion impossible pour le moment.');
    } finally {
      setChargementId(null);
    }
  }

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
              <td className="px-4 py-3 text-gray-500">{u.role}</td>
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
                  {u.role !== 'SUPER_ADMIN' && (
                    <button
                      onClick={() => promouvoirSuperAdmin(u)}
                      disabled={chargementId === u.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-sky-200 text-sky-700 disabled:opacity-40"
                    >
                      Promouvoir Super-Admin
                    </button>
                  )}
                  <button
                    onClick={() => toggleBlocage(u)}
                    disabled={chargementId === u.id}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 ${
                      u.isBlocked
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {chargementId === u.id ? '...' : u.isBlocked ? 'Débloquer' : 'Bloquer'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
