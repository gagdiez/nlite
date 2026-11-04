import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getProvider } from '../dist/config.js';

test('RPC requests include Bearer authentication only when a key is set', async (t) => {
  const originalFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const name of ['NEAR_RPC_API_KEY', 'NEAR_MAINNET_RPC', 'NEAR_TESTNET_RPC', 'NEAR_CUSTOM_RPC']) {
      if (previousEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
  });

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, headers: new Headers(options.headers) };
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: JSON.parse(options.body).id,
      result: { amount: '1', locked: '0', code_hash: '11111111111111111111111111111111', storage_usage: 0, block_height: 123, block_hash: 'block' }
    }));
  };

  for (const network of ['mainnet', 'testnet', 'custom']) {
    const url = `https://${network}.rpc.invalid`;
    process.env[`NEAR_${network.toUpperCase()}_RPC`] = url;
    for (const apiKey of [undefined, '', 'test-api-key']) {
      if (apiKey === undefined) delete process.env.NEAR_RPC_API_KEY;
      else process.env.NEAR_RPC_API_KEY = apiKey;

      await getProvider(network).viewAccount({ accountId: 'example.testnet' });
      assert.equal(request.url, url);
      assert.equal(request.headers.get('Authorization'), apiKey ? 'Bearer test-api-key' : null);
      assert.equal(request.headers.get('Content-Type'), 'application/json');
    }
  }
});
