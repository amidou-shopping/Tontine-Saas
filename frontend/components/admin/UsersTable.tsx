'use client';

import { useState } from 'react';
import { apiFetch, extraireMessageErreur, getCurrentUser } from '@/lib/api';
import { libelleRole } from '@/lib/affichage';
import Button from '@/components/ui/Button';
import DataTable, { type Column } from '@/components/ui/DataTable';
import StatutBadge from '@/components/ui/StatutBadge';

export interface UtilisateurAdmin {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  role: string;
  estPrincipal?: boolean;
  isBlocked: boolean;
}

interface UsersTableProps {
  initialUsers: UtilisateurAdmin[];
  onMessage: (message: string, ton: 'succes' | 'danger') => void;
}

export default function UsersTable({ initialUsers, onMessage }: UsersTableProps) {
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
      onMessage(user.isBlocked ? 'Utilisateur débloqué.' : 'Utilisateur bloqué.', 'succes');
    } catch (err: any) {
      console.error(err);
      onMessage(
        err.message || 'Impossible d’effectuer cette action pour le moment. Réessayez.',
        'danger',
      );
    } finally {
      setChargementId(null);
    }
  }

  // Aucune promotion SUPER_ADMIN côté interface : création réservée au seed/CLI.
  const colonnes: Column<UtilisateurAdmin>[] = [
    {
      key: 'nom',
      header: 'Nom',
      render: (u) => (
        <div>
          <p className="font-medium text-ink">
            {u.prenom} {u.nom}
          </p>
          {u.estPrincipal && (
            <span className="mt-1 inline-flex rounded-pill bg-canvas px-3 py-1 text-meta font-medium text-muted-canvas">
              Principal
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (u) => (
        <div>
          <p className="text-ink">{u.email}</p>
          <p className="mt-1 text-meta text-muted-canvas" dir="ltr">
            {u.telephone}
          </p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rôle',
      render: (u) => libelleRole(u.role),
    },
    {
      key: 'statut',
      header: 'Statut',
      align: 'right',
      render: (u) => <StatutBadge statut={u.isBlocked ? 'BLOQUE' : 'ACTIF'} />,
    },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      render: (u) => {
        const protege =
          u.estPrincipal || u.id === acteurId || (u.role === 'SUPER_ADMIN' && !acteurEstPrincipal);
        if (protege) {
          const raison = u.estPrincipal
            ? 'Compte protégé'
            : u.id === acteurId
              ? 'Vous-même'
              : 'Réservé au principal';
          return <span className="text-meta text-muted-canvas">{raison}</span>;
        }
        return (
          <Button
            variant="secondary"
            disabled={chargementId === u.id}
            onClick={() => void toggleBlocage(u)}
          >
            {chargementId === u.id
              ? 'Patientez...'
              : u.isBlocked
                ? 'Débloquer'
                : 'Bloquer'}
          </Button>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={colonnes}
      rows={users}
      getRowKey={(u) => u.id}
      caption="Utilisateurs de la plateforme"
      vide="Aucun utilisateur à afficher."
    />
  );
}
