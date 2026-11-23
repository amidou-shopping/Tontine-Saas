import { createHmac } from 'crypto';
import { trouverSignatureHeader, verifierHmacSha256 } from '../src/payments/providers/signature.util';

const secret = 'secret-webhook';
const rawBody = '{"reference":"tontine:user:1","statut":"SUCCESS"}';
const hmac = createHmac('sha256', secret).update(rawBody).digest('hex');

describe('verifierHmacSha256', () => {
  it('accepte une signature HMAC calculée sur le corps brut', () => {
    expect(verifierHmacSha256(rawBody, hmac, secret)).toBe(true);
    expect(verifierHmacSha256(rawBody, `sha256=${hmac}`, secret)).toBe(true);
    expect(verifierHmacSha256(rawBody, `t=${Math.floor(Date.now() / 1000)},v1=${hmac}`, secret)).toBe(true);
  });

  it('rejette une signature erronée, absente ou de longueur différente', () => {
    expect(verifierHmacSha256(rawBody, 'deadbeef', secret)).toBe(false);
    expect(verifierHmacSha256(rawBody, undefined, secret)).toBe(false);
    expect(verifierHmacSha256(rawBody, hmac, undefined)).toBe(false);
  });

  it('rejette un timestamp ancien (anti-replay)', () => {
    const ancien = Math.floor(Date.now() / 1000) - 3600;
    expect(verifierHmacSha256(rawBody, `t=${ancien},v1=${hmac}`, secret)).toBe(false);
  });

  it('retrouve le header de signature quel que soit son nom', () => {
    expect(trouverSignatureHeader({ 'x-signature': hmac })).toBe(hmac);
    expect(trouverSignatureHeader({ 'wave-signature': [hmac] })).toBe(hmac);
    expect(trouverSignatureHeader({})).toBeUndefined();
  });
});
