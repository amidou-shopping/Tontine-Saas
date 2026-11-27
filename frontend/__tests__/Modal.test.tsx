import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Modal from '@/components/ui/Modal';

/**
 * Reproduit le formulaire « Créer une tontine » : le callback de fermeture est
 * une fonction inline, recréée à chaque frappe, et le champ est contrôlé.
 */
function FormulaireAvecModal({ onFermer }: { onFermer?: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState('');

  return (
    <>
      <button onClick={() => setOuvert(true)}>Ouvrir la fenêtre</button>
      <Modal
        ouvert={ouvert}
        onFermer={() => {
          onFermer?.();
          setOuvert(false);
        }}
        titre="Créer une tontine"
      >
        <form>
          <label htmlFor="nom-tontine">Nom de la tontine</label>
          <input
            id="nom-tontine"
            value={nom}
            onChange={(event) => setNom(event.target.value)}
          />
          <button type="button">Annuler</button>
        </form>
      </Modal>
    </>
  );
}

function FenetreSansChamp() {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button onClick={() => setOuvert(true)}>Afficher</button>
      <Modal ouvert={ouvert} onFermer={() => setOuvert(false)} titre="Confirmation">
        <p>Confirmez-vous ?</p>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('garde le focus dans le champ pendant la saisie, malgré les rendus', async () => {
    const utilisateur = userEvent.setup();
    render(<FormulaireAvecModal />);

    await utilisateur.click(screen.getByRole('button', { name: 'Ouvrir la fenêtre' }));
    const champ = screen.getByLabelText('Nom de la tontine');
    expect(champ).toHaveFocus();

    for (const caractere of 'tontine') {
      await utilisateur.keyboard(caractere);
      expect(document.activeElement).toBe(champ);
    }

    expect(champ).toHaveValue('tontine');
    expect(screen.getByRole('button', { name: 'Fermer la fenêtre' })).not.toHaveFocus();
  });

  it('rend le focus au déclencheur à la fermeture', async () => {
    const utilisateur = userEvent.setup();
    render(<FormulaireAvecModal />);

    const declencheur = screen.getByRole('button', { name: 'Ouvrir la fenêtre' });
    await utilisateur.click(declencheur);
    await utilisateur.click(screen.getByRole('button', { name: 'Fermer la fenêtre' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(declencheur).toHaveFocus();
  });

  it('utilise le dernier callback pour Échap', async () => {
    const utilisateur = userEvent.setup();
    const onFermer = vi.fn();
    render(<FormulaireAvecModal onFermer={onFermer} />);

    await utilisateur.click(screen.getByRole('button', { name: 'Ouvrir la fenêtre' }));
    await utilisateur.keyboard('{Escape}');

    expect(onFermer).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('place le focus sur la boîte quand il n’y a aucun champ éditable', async () => {
    const utilisateur = userEvent.setup();
    render(<FenetreSansChamp />);
    await utilisateur.click(screen.getByRole('button', { name: 'Afficher' }));

    expect(screen.getByRole('dialog')).toHaveFocus();
  });
});
