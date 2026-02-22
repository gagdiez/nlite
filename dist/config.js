const DEFAULT_NETWORK = process.env.NEAR_NETWORK || 'testnet';
function getConfig(env) {
    switch (env) {
        case 'mainnet':
            return {
                networkId: 'mainnet',
                nodeUrl: process.env.NEAR_MAINNET_RPC || 'https://free.rpc.fastnear.com',
                helperUrl: 'https://helper.mainnet.near.org',
                TLA: 'near'
            };
        case 'testnet':
            return {
                networkId: 'testnet',
                nodeUrl: process.env.NEAR_TESTNET_RPC || 'https://rpc.testnet.near.org',
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
export { getConfig, DEFAULT_NETWORK };
