import { JsonRpcProvider } from 'near-api-js';
const DEFAULT_NETWORK = process.env.NEAR_NETWORK || 'testnet';
function getConfig(env) {
    switch (env) {
        case 'mainnet':
            return {
                networkId: 'mainnet',
                nodeUrl: process.env.NEAR_MAINNET_RPC || 'https://rpc.mainnet.fastnear.com',
                helperUrl: 'https://helper.mainnet.near.org',
                TLA: 'near'
            };
        case 'testnet':
            return {
                networkId: 'testnet',
                nodeUrl: process.env.NEAR_TESTNET_RPC || 'https://rpc.testnet.fastnear.com',
                helperUrl: 'https://helper.testnet.near.org',
                TLA: 'testnet'
            };
        case 'custom':
            return {
                networkId: 'custom',
                nodeUrl: process.env.NEAR_CUSTOM_RPC,
                walletUrl: process.env.NEAR_CUSTOM_WALLET,
                helperUrl: process.env.NEAR_CUSTOM_HELPER,
                TLA: process.env.NEAR_CUSTOM_TLA
            };
        default:
            throw new Error(`Unconfigured environment '${env}'. Can be configured in config.ts.`);
    }
}
function getProvider(networkId) {
    const config = getConfig(networkId);
    const apiKey = process.env.NEAR_RPC_API_KEY;
    return new JsonRpcProvider({
        url: config.nodeUrl ?? '',
        ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {})
    });
}
export { getConfig, getProvider, DEFAULT_NETWORK };
