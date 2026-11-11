import { Account } from 'near-api-js';
import { getProvider } from '../config.js';
import { signerFromOpts } from './utils.js';

export type NetworkOptions = { networkId: string };
export type SigningOptions = NetworkOptions & { privateKey?: string | null };

export async function protocolAccount(accountId: string, options: SigningOptions): Promise<Account> {
  return new Account(accountId, getProvider(options.networkId), await signerFromOpts({ ...options, useAccount: accountId }));
}

export function printResult(result: unknown): void {
  console.log(JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}
