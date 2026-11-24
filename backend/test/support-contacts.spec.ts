/**
 * Tests de la Phase 5 : configuration des contacts support et liens WhatsApp.
 * Aucune base de données n'est nécessaire (utilitaires + contrôleur unittesté).
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  lireContactsSupport,
  normaliserNumeroSupport,
} from '../src/common/contacts-support.util';
import { MemberController } from '../src/member/member.controller';

const CLES_SUPPORT = [
  'SUPPORT_1_NAME',
  'SUPPORT_1_PHONE',
  'SUPPORT_2_NAME',
  'SUPPORT_2_PHONE',
  'SUPPORT_3_NAME',
  'SUPPORT_3_PHONE',
];

function configurerContacts() {
  process.env.SUPPORT_1_NAME = 'Support Wave';
  process.env.SUPPORT_1_PHONE = '221000000000';
  process.env.SUPPORT_2_NAME = 'Support Orange Money';
  process.env.SUPPORT_2_PHONE = '221000000001';
  process.env.SUPPORT_3_NAME = 'Support technique';
  process.env.SUPPORT_3_PHONE = '221000000002';
}

afterEach(() => {
  for (const cle of CLES_SUPPORT) delete process.env[cle];
});

describe('numéros support (Phase 5)', () => {
  it('accepte le format international sans + et retire un + saisi par erreur', () => {
    expect(normaliserNumeroSupport('221000000000')).toBe('221000000000');
    expect(normaliserNumeroSupport('+221 00 000 00 00')).toBe('221000000000');
  });

  it('ignore les numéros invalides ou vides', () => {
    expect(normaliserNumeroSupport('')).toBeNull();
    expect(normaliserNumeroSupport(undefined)).toBeNull();
    expect(normaliserNumeroSupport('2210000abc')).toBeNull();
    expect(normaliserNumeroSupport('+')).toBeNull();
  });
});

describe('contacts support et lien WhatsApp (Phase 5)', () => {
  it('renvoie 3 contacts avec un lien wa.me prérempli de l’identifiant', () => {
    configurerContacts();
    const contacts = lireContactsSupport('utilisateur-123');

    expect(contacts).toHaveLength(3);
    expect(contacts[0]).toMatchObject({
      nom: 'Support Wave',
      telephone: '221000000000',
    });
    for (const contact of contacts) {
      expect(contact.lienWhatsApp).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
      const texte = new URL(contact.lienWhatsApp).searchParams.get('text');
      expect(texte).toContain('utilisateur-123');
    }
  });

  it('utilise un nom par défaut si le nom n’est pas configuré', () => {
    configurerContacts();
    delete process.env.SUPPORT_2_NAME;
    const contacts = lireContactsSupport('id-test');

    expect(contacts[1].nom).toBe('Support 2');
  });

  it('omet les contacts dont le numéro est invalide et ne renvoie rien sans configuration', () => {
    configurerContacts();
    process.env.SUPPORT_3_PHONE = 'numéro-invalide';
    expect(lireContactsSupport('id-test')).toHaveLength(2);

    for (const cle of CLES_SUPPORT) delete process.env[cle];
    expect(lireContactsSupport('id-test')).toEqual([]);
  });

  it('expose les contacts via la route protégée /member/support-contacts', () => {
    configurerContacts();
    const controller = new MemberController(
      {} as any,
      {} as any,
      {} as any,
      { log: jest.fn() } as any,
    );

    const resultat = controller.getSupportContacts({ user: { id: 'abc-123' } });
    expect(resultat.contacts).toHaveLength(3);
    expect(resultat.contacts[0].lienWhatsApp).toContain('abc-123');
  });
});
