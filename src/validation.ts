import { KeyPair, type KeyPairString, PublicKey } from 'near-api-js';
import { parseSeedPhrase } from 'near-api-js/seed-phrase';

function requireKeyPrefix(value: string, label: string): void {
  if (!/^[^:]+:[^:]+$/.test(value)) {
    throw new Error(`${label} must include its curve prefix (for example, ed25519:...).`);
  }
}

export function publicKey(value: string): string {
  requireKeyPrefix(value, 'Public key');
  try {
    if (PublicKey.from(value).toString() !== value) throw new Error('Non-canonical public key');
  }
  catch { throw new Error('Invalid public key.'); }
  return value;
}

export function privateKey(value: string): string {
  requireKeyPrefix(value, 'Private key');
  try {
    if (KeyPair.fromString(value as KeyPairString).toString() !== value) throw new Error('Non-canonical private key');
  }
  catch { throw new Error('Invalid private key.'); }
  return value;
}

export const privateKeyOption = {
  desc: 'Private key to use instead of local credentials (including its curve prefix)',
  type: 'string' as const,
  coerce: privateKey
};

export function seedPhrase(value: string): string {
  try { parseSeedPhrase(value); }
  catch { throw new Error('Invalid seed phrase.'); }
  return value;
}

export function base64Args(value: string | undefined): void {
  if (value === undefined) throw new Error('--base64 requires arguments.');
  const padded = value.includes('=') ? value : value.padEnd(Math.ceil(value.length / 4) * 4, '=');
  if (Buffer.from(value, 'base64').toString('base64') !== padded) {
    throw new Error('Arguments must be valid base64 when --base64 is used.');
  }
}
