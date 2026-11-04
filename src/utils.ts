import { KeyPair, KeyPairSigner, KeyPairString, Signer } from "near-api-js";
import { LegacyKeyStoreSigner } from "./signers/local_credentials.js";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { privateKey as validatePrivateKey } from './validation.js';

export async function signerFromOpts({ useAccount, privateKey, networkId }: {
    useAccount: string;
    privateKey?: string | null;
    networkId: string;
}): Promise<Signer> {
    if (privateKey !== undefined && privateKey !== null) {
        return KeyPairSigner.fromSecretKey(validatePrivateKey(privateKey) as KeyPairString);
    }

    return new LegacyKeyStoreSigner(useAccount, networkId as 'testnet' | 'mainnet');
}

function credentialDirectory(networkId: string): string {
  const credentialDir = path.join(os.homedir(), '.near-credentials', networkId);
  fs.mkdirSync(credentialDir, { recursive: true, mode: 0o700 });
  return credentialDir;
}

function writeRecoveryKey(accountId: string, networkId: string, keyPair: KeyPair): string {
  const recoveryPath = path.join(credentialDirectory(networkId), `.pending-${randomUUID()}.json`);
  const payload = {
    account_id: accountId,
    public_key: keyPair.getPublicKey().toString(),
    private_key: keyPair.toString()
  };

  const descriptor = fs.openSync(recoveryPath, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, JSON.stringify(payload, null, 2));
    fs.fsyncSync(descriptor);
  } catch (error) {
    fs.closeSync(descriptor);
    fs.unlinkSync(recoveryPath);
    throw error;
  }
  fs.closeSync(descriptor);
  return recoveryPath;
}

export function prepareAccountCredentials(accountId: string, networkId: string, keyPair: KeyPair) {
  const recoveryPath = writeRecoveryKey(accountId, networkId, keyPair);
  return {
    path: recoveryPath,
    committed: false,
    commit() {
      // Rename atomically replaces stale credentials without truncating the old file first.
      fs.renameSync(recoveryPath, path.join(credentialDirectory(networkId), `${accountId}.json`));
      this.committed = true;
    }
  };
}

export function storeCredentials(accountId: string, networkId: string, keyPair: KeyPair, force = false): boolean {
  const credentialPath = path.join(credentialDirectory(networkId), `${accountId}.json`);
  if (fs.existsSync(credentialPath) && !force) {
    console.log(`Account ${accountId} already has credentials stored locally. Use --force to overwrite them.`);
    return false;
  }

  const temporaryPath = writeRecoveryKey(accountId, networkId, keyPair);
  try {
    if (force) fs.renameSync(temporaryPath, credentialPath);
    else fs.linkSync(temporaryPath, credentialPath);
  } catch (error) {
    if (!force && (error as NodeJS.ErrnoException).code === 'EEXIST') {
      console.log(`Account ${accountId} already has credentials stored locally. Use --force to overwrite them.`);
      return false;
    }
    throw error;
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
  return true;
}
