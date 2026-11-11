import fs from 'node:fs';
import {
  DeterministicStateInit, UniversalStateInit, nearToYocto, type StateInitData,
} from 'near-api-js';
import { printResult, protocolAccount, type SigningOptions } from '../../protocol.js';
import { publicKey, base64Args } from '../../validation.js';

type StateOptions = { stateInit: string; scheme: 'deterministic' | 'universal'; dataEncoding: 'base64' | 'utf8' };
type CreateOptions = StateOptions & SigningOptions & { useAccount: string; storageDeposit: string; quiet?: boolean };

function readState(options: StateOptions): { accountId: string; deterministic?: DeterministicStateInit; universal?: Uint8Array } {
  const payload = JSON.parse(fs.readFileSync(options.stateInit, 'utf8')) as {
    code?: { accountId: string } | { codeHash: string }; data?: Record<string, string>; accessKeys?: string[];
  };
  const decode = (value: string) => {
    if (options.dataEncoding === 'base64') base64Args(value);
    return Buffer.from(value, options.dataEncoding);
  };
  const data: StateInitData = Object.entries(payload.data ?? {}).map(([key, value]) => [decode(key), decode(value)]);
  if (options.scheme === 'deterministic') {
    if (!payload.code) throw new Error('Deterministic state init requires code.');
    if (payload.accessKeys?.length) throw new Error('Use universal accounts to specify accessKeys; deterministic accounts put authorization in contract state.');
    const deterministic = new DeterministicStateInit({ code: payload.code, data });
    return { accountId: deterministic.deriveAccountId(), deterministic };
  }
  const universal = new UniversalStateInit({ code: payload.code, data, accessKeys: payload.accessKeys?.map(publicKey) });
  return { accountId: universal.deriveAccountId(), universal: universal.encode() };
}

export async function createStateAccount(options: CreateOptions): Promise<void> {
    const state = readState(options);
    const account = await protocolAccount(options.useAccount, options);
    const deposit = nearToYocto(options.storageDeposit as `${number}`);
    if (!options.quiet) console.log(`Creating state-derived account ${state.accountId}`);
    printResult(state.deterministic
      ? await account.createDeterministicAccount({ stateInit: state.deterministic, deposit })
      : await account.createUniversalAccount({ stateInit: state.universal!, deposit }));
}
