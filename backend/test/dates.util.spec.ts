import { JourSemaine } from '@prisma/client';
import {
  dateDuTour,
  demainUTC,
  libelleJour,
  minuitUTC,
  prochainJour,
  semaineSuivante,
} from '../src/common/dates.util';

describe('prochainJour (UTC)', () => {
  const mercredi = new Date('2026-01-07T14:37:00.000Z');

  it('retourne minuit UTC du jour demandé quand il est après la date', () => {
    expect(prochainJour(mercredi, JourSemaine.VENDREDI).toISOString()).toBe(
      '2026-01-09T00:00:00.000Z',
    );
  });

  it('est inclusif si la date est déjà ce jour à minuit UTC', () => {
    expect(prochainJour(new Date('2026-01-05T00:00:00.000Z'), JourSemaine.LUNDI).toISOString()).toBe(
      '2026-01-05T00:00:00.000Z',
    );
  });

  it('passe à la semaine suivante si le jour est déjà dépassé', () => {
    expect(prochainJour(mercredi, JourSemaine.LUNDI).toISOString()).toBe('2026-01-12T00:00:00.000Z');
  });

  it('gère DIMANCHE (getUTCDay = 0)', () => {
    expect(prochainJour(mercredi, JourSemaine.DIMANCHE).toISOString()).toBe(
      '2026-01-11T00:00:00.000Z',
    );
  });

  it('rejette un jour invalide', () => {
    expect(() => prochainJour(mercredi, 'LUNDI_ERREUR' as JourSemaine)).toThrow();
  });
});

describe('demainUTC / minuitUTC / semaineSuivante', () => {
  it('demainUTC renvoie minuit UTC du lendemain', () => {
    expect(demainUTC(new Date('2026-01-07T23:45:00.000Z')).toISOString()).toBe(
      '2026-01-08T00:00:00.000Z',
    );
  });

  it('minuitUTC Ignore l’heure locale', () => {
    expect(minuitUTC(new Date('2026-01-07T23:45:00.000Z')).toISOString()).toBe(
      '2026-01-07T00:00:00.000Z',
    );
  });

  it('semaineSuivante ajoute exactement 7 jours', () => {
    expect(semaineSuivante(new Date('2026-01-05T00:00:00.000Z')).toISOString()).toBe(
      '2026-01-12T00:00:00.000Z',
    );
  });
});

describe('dateDuTour', () => {
  const debut = new Date('2026-01-05T00:00:00.000Z'); // lundi

  it('le tour 1 correspond à dateDebut', () => {
    expect(dateDuTour(debut, 1).toISOString()).toBe('2026-01-05T00:00:00.000Z');
  });

  it('le tour N est dateDebut + (N - 1) * 7 jours', () => {
    expect(dateDuTour(debut, 3).toISOString()).toBe('2026-01-19T00:00:00.000Z');
  });

  it('rejette un numéro de tour invalide', () => {
    expect(() => dateDuTour(debut, 0)).toThrow();
  });

  it('libelleJour retourne le nom français en minuscule', () => {
    expect(libelleJour(JourSemaine.MERCREDI)).toBe('mercredi');
  });
});
