import { KeyPair, KeyPairSigner, KeyPairString, Signer } from "near-api-js";
import { LegacyKeyStoreSigner } from "./signers/local_credentials.js";
import { LedgerSigner } from "./signers/ledger.js";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function signerFromOpts({ useAccount, privateKey, signWithLedger, ledgerPath, networkId }: {
    useAccount: string;
    privateKey?: string | null;
    signWithLedger?: boolean;
    ledgerPath: string;
    networkId: string;
}): Promise<Signer> {
    if (privateKey) {
        return KeyPairSigner.fromSecretKey(privateKey as KeyPairString);
    }
    
    if (signWithLedger) {
        return new LedgerSigner(ledgerPath);
    }

    return new LegacyKeyStoreSigner(useAccount, networkId as 'testnet' | 'mainnet');
}

export function storeCredentials(accountId: string, networkId: string, keyPair: KeyPair): void {
  const credentialDir = path.join(os.homedir(), '.near-credentials', networkId);
  fs.mkdirSync(credentialDir, { recursive: true });

  const credentialPath = path.join(credentialDir, `${accountId}.json`);
  const payload = {
    account_id: accountId,
    public_key: keyPair.getPublicKey().toString(),
    private_key: keyPair.toString()
  };

  fs.writeFileSync(credentialPath, JSON.stringify(payload, null, 2));
}