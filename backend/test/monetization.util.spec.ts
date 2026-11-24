import {
  arrondiFCFA,
  calculerCommissionCotisation,
  calculerRepartitionCagnotte,
} from '../src/common/monetization.util';

describe('règle d’arrondi FCFA', () => {
  it('arrondit toujours à l’entier inférieur', () => {
    expect(arrondiFCFA(99.99)).toBe(99);
    expect(arrondiFCFA(0.9)).toBe(0);
    expect(arrondiFCFA(100)).toBe(100);
  });

  it('rejette un montant négatif ou non fini', () => {
    expect(() => arrondiFCFA(-1)).toThrow();
    expect(() => arrondiFCFA(Number.NaN)).toThrow();
  });
});

describe('calculerCommissionCotisation', () => {
  it('applique le taux configuré (3% ici) à chaque cotisation', () => {
    const resultat = calculerCommissionCotisation(10000, 0.03);
    expect(resultat.montantCommission).toBe(300);
    expect(resultat.montantNet).toBe(9700);
  });

  it('arrondit la commission à l’entier inférieur, jamais au plus proche', () => {
    const resultat = calculerCommissionCotisation(3333, 0.03);
    // 3333 * 3 % = 99,99 -> 99 FCFA (et non 100).
    expect(resultat.montantCommission).toBe(99);
    expect(resultat.montantNet).toBe(3234);
  });

  it('ne prélève rien à la distribution (appel avec un taux nul)', () => {
    const resultat = calculerCommissionCotisation(10000, 0);
    expect(resultat.montantCommission).toBe(0);
    expect(resultat.montantNet).toBe(10000);
  });

  it('rejette un montant nul, négatif ou non entier', () => {
    expect(() => calculerCommissionCotisation(0, 0.03)).toThrow();
    expect(() => calculerCommissionCotisation(-100, 0.03)).toThrow();
    expect(() => calculerCommissionCotisation(100.5, 0.03)).toThrow();
  });

  it('rejette un taux aberrant', () => {
    expect(() => calculerCommissionCotisation(10000, 0.5)).toThrow();
  });
});

describe('calculerRepartitionCagnotte', () => {
  it('calcule la cagnotte nette pour 4 cotisants', () => {
    const resultat = calculerRepartitionCagnotte(10000, 4, 0.03);
    expect(resultat.montantBrutTotal).toBe(40000);
    expect(resultat.commissionTotale).toBe(1200);
    expect(resultat.montantAVerserAuGagnant).toBe(38800);
  });

  it('additionne les arrondis unitaires (cohérent avec le ledger)', () => {
    const resultat = calculerRepartitionCagnotte(3333, 3, 0.03);
    // 99 FCFA par cotisation, soit 297 au total (un arrondi global donnerait 300).
    expect(resultat.commissionTotale).toBe(297);
    expect(resultat.montantAVerserAuGagnant).toBe(9702);
  });

  it('rejette un nombre de cotisants nul', () => {
    expect(() => calculerRepartitionCagnotte(10000, 0, 0.03)).toThrow();
  });
});
