type Ton = 'succes' | 'avertissement' | 'danger' | 'neutre';

type Statut =
  | 'PAYE'
  | 'REUSSIE'
  | 'ACCEPTEE'
  | 'ACTIVE'
  | 'ACTIF'
  | 'EN_ATTENTE'
  | 'A_PAYER'
  | 'EN_RETARD'
  | 'ARRIERE'
  | 'REFUSEE'
  | 'ECHOUEE'
  | 'ANNULEE'
  | 'EXCLU'
  | 'BLOQUE'
  | 'GRATUIT'
  | 'STANDARD'
  | 'PREMIUM'
  | string;

const STATUTS: Record<string, { libelle: string; ton: Ton }> = {
  PAYE: { libelle: 'Payé', ton: 'succes' },
  REUSSIE: { libelle: 'Réussie', ton: 'succes' },
  ACCEPTEE: { libelle: 'Acceptée', ton: 'succes' },
  ACTIVE: { libelle: 'Active', ton: 'succes' },
  ACTIF: { libelle: 'Actif', ton: 'succes' },
  EN_ATTENTE: { libelle: 'En attente', ton: 'avertissement' },
  A_PAYER: { libelle: 'À payer', ton: 'avertissement' },
  EN_RETARD: { libelle: 'En retard', ton: 'danger' },
  ARRIERE: { libelle: 'Arriéré', ton: 'danger' },
  REFUSEE: { libelle: 'Refusée', ton: 'danger' },
  ECHOUEE: { libelle: 'Échouée', ton: 'danger' },
  ANNULEE: { libelle: 'Annulée', ton: 'neutre' },
  EXCLU: { libelle: 'Exclu', ton: 'danger' },
  BLOQUE: { libelle: 'Bloqué', ton: 'danger' },
  GRATUIT: { libelle: 'Gratuit', ton: 'neutre' },
  STANDARD: { libelle: 'Standard', ton: 'neutre' },
  PREMIUM: { libelle: 'Premium', ton: 'neutre' },
};

const TONS: Record<Ton, string> = {
  succes: 'bg-success-surface text-success',
  // #C98A2B n'atteint pas AA comme texte sur fond clair : il reste la couleur
  // du pourtour, le libellé est en encre.
  avertissement: 'border border-warning bg-warning-surface text-ink',
  danger: 'bg-danger-surface text-danger',
  neutre: 'bg-canvas text-muted-canvas',
};

/** Le statut est toujours écrit en texte : la couleur n'est jamais le seul signal. */
export default function StatutBadge({ statut }: { statut: Statut }) {
  const donnees = STATUTS[statut] ?? { libelle: statut, ton: 'neutre' as Ton };
  return (
    <span
      className={`inline-flex items-center rounded-pill px-3 py-1 text-meta font-medium ${TONS[donnees.ton]}`}
    >
      {donnees.libelle}
    </span>
  );
}
