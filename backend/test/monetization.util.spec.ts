import { calculerCommissionCotisation, calculerRepartitionCagnotte } from '../src/common/monetization.util';

describe('calculerCommissionCotisation', () => {
  it('calcule correctement la commission à 1.5%', () => {
    const resultat = calculerCommissionCotisation(10000, 0.015);
    expect(resultat.montantCommission).toBe(150);
    expect(resultat.montantNet).toBe(9850);
  });

  it('arrondit la commission au franc le plus proche', () => {
    const resultat = calculerCommissionCotisation(3333, 0.015);
    // 3333 * 0.015 = 49.995 -> arrondi à 50
    expect(resultat.montantCommission).toBe(50);
    expect(resultat.montantNet).toBe(3283);
  });

  it('rejette un montant négatif ou nul', () => {
    expect(() => calculerCommissionCotisation(0, 0.015)).toThrow();
    expect(() => calculerCommissionCotisation(-100, 0.015)).toThrow();
  });

  it('rejette un taux de commission aberrant', () => {
    expect(() => calculerCommissionCotisation(10000, 0.5)).toThrow();
  });
});

describe('calculerRepartitionCagnotte', () => {
  it('calcule la cagnotte nette pour 4 cotisants', () => {
    const resultat = calculerRepartitionCagnotte(10000, 4, 0.015);
    expect(resultat.montantBrutTotal).toBe(40000);
    expect(resultat.commissionTotale).toBe(600);
    expect(resultat.montantAVerserAuGagnant).toBe(39400);
  });

  it('rejette un nombre de cotisants nul', () => {
    expect(() => calculerRepartitionCagnotte(10000, 0, 0.015)).toThrow();
  });

  it('additionne les arrondis unitaires (cohérent avec le ledger)', () => {
    const resultat = calculerRepartitionCagnotte(1111, 3, 0.015);
    // 1111 * 1,5 % = 16,665 -> 17 FCFA par cotisation, soit 51 au total.
    // Un arrondi sur le global donnerait 50 : la cagnotte doit suivre le ledger.
    expect(resultat.commissionTotale).toBe(51);
    expect(resultat.montantAVerserAuGagnant).toBe(3282);
  });
});
