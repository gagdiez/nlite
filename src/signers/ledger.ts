import { Signer, PublicKey, KeyType } from 'near-api-js';
import { createClient } from 'near-ledger-js';
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import { exit } from 'process';

interface Client {
    transport: any;
    getVersion(): Promise<string>;
    getPublicKey(path: any): Promise<Buffer<any>>;
    sign(transactionData: any, path: any): Promise<Buffer<any> | undefined>;
}

export class LedgerSigner extends Signer {
    hdKeyPath: string;
    private cachedPublicKey: PublicKey | null = null;
    private client!: Client;
    private transport!: any;

    constructor(hdKeyPath: string) {
        super();
        this.hdKeyPath = hdKeyPath;
    }

    async getPublicKey(): Promise<PublicKey> {
        if (this.cachedPublicKey) {
            return Promise.resolve(this.cachedPublicKey);
        }

        this.transport = await (TransportNodeHid as any).create();
        this.client = createClient(this.transport);
        try {
            const rawPublicKey = await this.client.getPublicKey(this.hdKeyPath);
            const publicKey = new PublicKey({ keyType: KeyType.ED25519, data: rawPublicKey });
            this.cachedPublicKey = publicKey;
            return publicKey;
        } catch (error) {
            return this.handleLedgerError(error);
        }
    }

    async signBytes(bytes: Uint8Array): Promise<Uint8Array> {
        const publicKey = await this.getPublicKey();
        try {
            const signature = await this.client.sign(bytes, this.hdKeyPath);
            if (!signature) {
                throw new Error('Failed to obtain signature from Ledger');
            }
            return Uint8Array.from(signature);
        } catch (error) {
            return this.handleLedgerError(error);
        }
    }

    private handleLedgerError(error: any): never {
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
