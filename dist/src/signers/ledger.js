import { Signer, PublicKey, KeyType } from 'near-api-js';
import { createClient } from 'near-ledger-js';
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import { exit } from 'process';
export class LedgerSigner extends Signer {
    hdKeyPath;
    cachedPublicKey = null;
    client;
    transport;
    constructor(hdKeyPath) {
        super();
        this.hdKeyPath = hdKeyPath;
    }
    async getPublicKey() {
        if (this.cachedPublicKey) {
            return Promise.resolve(this.cachedPublicKey);
        }
        this.transport = await TransportNodeHid.create();
        this.client = createClient(this.transport);
        try {
            const rawPublicKey = await this.client.getPublicKey(this.hdKeyPath);
            const publicKey = new PublicKey({ keyType: KeyType.ED25519, data: rawPublicKey });
            this.cachedPublicKey = publicKey;
            return publicKey;
        }
        catch (error) {
            return this.handleLedgerError(error);
        }
    }
    async signBytes(bytes) {
        const publicKey = await this.getPublicKey();
        try {
            const signature = await this.client.sign(bytes, this.hdKeyPath);
            if (!signature) {
                throw new Error('Failed to obtain signature from Ledger');
            }
            return Uint8Array.from(signature);
        }
        catch (error) {
            return this.handleLedgerError(error);
        }
    }
    handleLedgerError(error) {
        switch (error.statusText) {
            case 'CONDITIONS_OF_USE_NOT_SATISFIED':
                console.log('Rejected from Ledger');
                exit(1);
                break;
            case 'UNKNOWN_ERROR':
                console.log(`Ledger returned an unknown error (${error.statusCode}). Check your Ledger and try again`);
                exit(1);
                break;
            default:
                throw error;
        }
    }
}
