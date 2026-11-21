import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet as verify } from '../functions/verify.js';
import { onRequestPost as set } from '../functions/set.js';
import { onRequestGet as loc } from '../functions/loc.json.js';
import { onRequestGet as list, onRequestPost as add } from '../functions/favorites/index.js';
import { onRequestDelete as remove } from '../functions/favorites/[id].js';
import { onRequestGet as moduleLink } from '../functions/ios-location-spoofer.sgmodule.js';

test('deployment config separates production and preview storage', async () => {
  const c = JSON.parse(await readFile(new URL('../wrangler.json.example', import.meta.url)));
  assert.equal(c.pages_build_output_dir, './public');
  assert.equal(c.kv_namespaces[0].binding, 'SPOOFER_DATA');
  assert.equal(c.env.preview.kv_namespaces[0].binding, 'SPOOFER_DATA');
  assert.notEqual(c.kv_namespaces[0].id, c.env.preview.kv_namespaces[0].id);
  assert.equal(c.vars?.TOKEN, undefined);
});

test('auth, coordinate round trip, favorites and generated module', async () => {
  const data = new Map();
  const env = { TOKEN: 'test-token', SPOOFER_DATA: {
    get: async key => data.has(key) ? JSON.parse(data.get(key)) : null,
    put: async (key, value) => data.set(key, value)
  }};
  const ctx = (path, method = 'GET', body) => ({
    env, request: new Request('https://example.test' + path, {
      method, ...(body ? { body: JSON.stringify(body) } : {})
    })
  });
  for (const [handler, path, method] of [
    [verify, '/verify', 'GET'], [loc, '/loc.json', 'GET'],
    [set, '/set', 'POST'], [list, '/favorites', 'GET'],
    [add, '/favorites', 'POST'], [remove, '/favorites/x', 'DELETE']
  ]) {
    assert.equal((await handler(ctx(path, method))).status, 401);
    assert.equal((await handler(ctx(path + '?token=wrong', method))).status, 401);
  }
  assert.equal((await verify(ctx('/verify?token=test-token'))).status, 200);
  const saved = await set(ctx('/set?token=test-token', 'POST', { latitude: 31.2, longitude: 121.5 }));
  assert.equal(saved.status, 200);
  assert.equal((await (await loc(ctx('/loc.json?token=test-token'))).json()).latitude, 31.2);
  const fav = await (await add(ctx('/favorites?token=test-token', 'POST',
    { name: 'test', latitude: 31.2, longitude: 121.5 }))).json();
  assert.equal((await (await list(ctx('/favorites?token=test-token'))).json()).length, 1);
  await remove({ ...ctx('/favorites/' + fav.id + '?token=test-token', 'DELETE'), params: { id: fav.id } });
  assert.deepEqual(await (await list(ctx('/favorites?token=test-token'))).json(), []);
  env.ASSETS = { fetch: async () => new Response(await readFile(
    new URL('../public/ios-location-spoofer.sgmodule', import.meta.url), 'utf8')) };
  const module = await (await moduleLink(ctx('/ios-location-spoofer.sgmodule?token=test-token'))).text();
  assert.ok(module.includes('https://example.test/location-spoofer.js'));
  assert.ok(module.includes('https://example.test/loc.json?token=test-token'));
  assert.ok(!module.includes('你的域名'));
  assert.ok(!module.includes('你的Token'));
});

