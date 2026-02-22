declare module 'near-ledger-js' {
    export interface LedgerClient {
        transport: any;
        getVersion(): Promise<string>;
        getPublicKey(path: string): Promise<Buffer>;
        sign(transactionData: Uint8Array, path: string): Promise<Buffer | undefined>;
    }

    export function createClient(transport: any): LedgerClient;
}
