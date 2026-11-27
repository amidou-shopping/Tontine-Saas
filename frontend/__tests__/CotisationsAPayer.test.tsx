import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CotisationsAPayer from '@/components/CotisationsAPayer';
import { formaterDate, formaterMontant } from '@/lib/affichage';
import type { CotisationDue } from '@/lib/cotisations';

const COTISATIONS: CotisationDue[] = [
  {
    id: 'alpha-2',
    tontineId: 'alpha',
    tontineNom: 'Tontine Alpha',
    cycle: 2,
    cycleActuel: 3,
    dateEcheance: '2026-11-20T00:00:00.000Z',
    montant: 10000,
    amende: 1000,
    statut: 'EN_RETARD',
  },
  {
    id: 'beta-1',
    tontineId: 'beta',
    tontineNom: 'Tontine Beta',
    cycle: 1,
    cycleActuel: 2,
    dateEcheance: '2026-11-25T00:00:00.000Z',
    montant: 5000,
    amende: 0,
    statut: 'EN_RETARD',
  },
  {
    id: 'alpha-3',
    tontineId: 'alpha',
    tontineNom: 'Tontine Alpha',
    cycle: 3,
    cycleActuel: 3,
    dateEcheance: '2026-11-27T00:00:00.000Z',
    montant: 10000,
    amende: 0,
    statut: 'A_PAYER',
  },
];

/** Harness : le paiement retire la cotisation réglée, comme le fait le dashboard. */
function ListeAvecPaiement() {
  const [cotisations, setCotisations] = useState(COTISATIONS);

  return (
    <CotisationsAPayer
      cotisations={cotisations}
      onPayer={(cotisation) =>
        setCotisations((precedentes) => precedentes.filter((c) => c.id !== cotisation.id))
      }
    />
  );
}

describe('CotisationsAPayer', () => {
  it('affiche toutes les cotisations dues, triées de la plus ancienne à la plus récente', () => {
    render(<CotisationsAPayer cotisations={COTISATIONS} onPayer={vi.fn()} />);

    const lignes = screen.getAllByRole('listitem');
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toHaveTextContent('Tontine Alpha');
    expect(lignes[0]).toHaveTextContent('Tour 2 sur 3');
    expect(lignes[1]).toHaveTextContent('Tontine Beta');
    expect(lignes[2]).toHaveTextContent('Tour 3 sur 3');
    expect(screen.getAllByText('En retard')).toHaveLength(2);
    expect(screen.getAllByText('À payer')).toHaveLength(1);
    expect(lignes[0]).toHaveTextContent('Amende');
    expect(lignes[1]).not.toHaveTextContent('Amende');
  });

  it('calcule le total de toutes les cotisations, amendes comprises', () => {
    render(<CotisationsAPayer cotisations={COTISATIONS} onPayer={vi.fn()} />);

    expect(screen.getByText(/À payer :/).textContent).toContain(formaterMontant(26000));
  });

  it('affiche un état vide explicite', () => {
    render(<CotisationsAPayer cotisations={[]} onPayer={vi.fn()} />);

    expect(screen.getByText('Aucune cotisation à régler.')).toBeInTheDocument();
    expect(screen.queryByText(/À payer :/)).not.toBeInTheDocument();
  });

  it('n’active que la plus ancienne cotisation impayée de chaque tontine', () => {
    render(<CotisationsAPayer cotisations={COTISATIONS} onPayer={vi.fn()} />);

    const boutons = screen.getAllByRole('button', { name: 'Payer' });
    expect(boutons).toHaveLength(3);
    expect(boutons[0]).toBeEnabled(); // Alpha, tour 2
    expect(boutons[1]).toBeEnabled(); // Beta, tour 1
    expect(boutons[2]).toBeDisabled(); // Alpha, tour 3

    expect(
      screen.getByText(
        `Réglez d’abord la cotisation du ${formaterDate(COTISATIONS[0].dateEcheance)}`,
      ),
    ).toBeInTheDocument();
  });

  it('active la cotisation suivante après un paiement, sans rechargement', async () => {
    const utilisateur = userEvent.setup();
    render(<ListeAvecPaiement />);

    await utilisateur.click(screen.getAllByRole('button', { name: 'Payer' })[0]);

    const tourSuivant = screen.getByText('Tour 3 sur 3').closest('li') as HTMLElement;
    expect(within(tourSuivant).getByRole('button', { name: 'Payer' })).toBeEnabled();
    expect(
      screen.queryByText(
        `Réglez d’abord la cotisation du ${formaterDate(COTISATIONS[0].dateEcheance)}`,
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/À payer :/).textContent).toContain(formaterMontant(15000));
  });
});
