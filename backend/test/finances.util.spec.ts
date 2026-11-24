import {
  calculerAmendeRetard,
  calculerArriere,
  estApresDelaiGrace,
} from '../src/common/finances.util';

const parametres = { tauxCommission: 0.03, tauxAmende: 0.1, delaiGraceHeures: 24 };

describe('délai de grâce et amende', () => {
  const echeance = new Date('2026-01-05T00:00:00.000Z');

  it('considère l’échéance + 24h comme encore dans le délai de grâce', () => {
    expect(estApresDelaiGrace(echeance, new Date('2026-01-06T00:00:00.000Z'), 24)).toBe(false);
  });

  it('considère une seconde de plus comme en retard', () => {
    expect(estApresDelaiGrace(echeance, new Date('2026-01-06T00:00:00.001Z'), 24)).toBe(true);
  });

  it('ne crée aucune amende avant l’expiration du délai', () => {
    expect(calculerAmendeRetard(10000, 0.1, false)).toBe(0);
  });

  it('calcule 10% de la cotisation due et arrondit à l’entier inférieur', () => {
    expect(calculerAmendeRetard(10000, 0.1, true)).toBe(1000);
    expect(calculerAmendeRetard(3333, 0.1, true)).toBe(333);
  });

  it('l’amende est distincte de la commission (aucune commission dessus)', () => {
    expect(calculerAmendeRetard(10000, 0.1, true)).toBe(1000);
    expect(parametres.tauxCommission).toBe(0.03); // taux appliqué seulement à la cotisation
  });
});

describe('calculerArriere', () => {
  it('retourne cotisation + amende et l’échéance du tour impayé (7 jours par tour)', () => {
    const arriere = calculerArriere(
      parametres,
      new Date('2026-01-05T00:00:00.000Z'),
      2,
      10000,
      new Date('2026-01-20T00:00:00.000Z'),
    );
    expect(arriere.cycle).toBe(2);
    expect(arriere.cotisationDue).toBe(10000);
    expect(arriere.amende).toBe(1000);
    expect(arriere.montantTotal).toBe(11000);
    expect(arriere.dateEcheance.toISOString()).toBe('2026-01-12T00:00:00.000Z');
  });
});
