import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, normalizeGiphy } from '../src/index.js';

const origin = 'https://lucasdonadio01.github.io';

test('normaliza resultados y calcula la siguiente página', () => {
  const result = normalizeGiphy({
    data: [{ title: 'Aang', images: { downsized_medium: { url: 'https://media.example/a.gif' }, fixed_width_small: { url: 'https://media.example/a-small.gif' } } }],
    pagination: { count: 1, total_count: 3 },
  }, 0);
  assert.equal(result.items[0].title, 'Aang');
  assert.equal(result.next, 1);
});

test('rechaza orígenes ajenos', async () => {
  const response = await handleRequest(new Request('https://worker.example/search?q=aang', { headers: { Origin: 'https://example.com' } }), { GIPHY_API_KEY: 'test' });
  assert.equal(response.status, 403);
});

test('valida búsquedas demasiado cortas', async () => {
  const response = await handleRequest(new Request('https://worker.example/search?q=a', { headers: { Origin: origin } }), { GIPHY_API_KEY: 'test' });
  assert.equal(response.status, 400);
});

test('conserva la frase y pide resultados localizados a GIPHY', async (t) => {
  let upstreamUrl = null;
  t.mock.method(globalThis, 'fetch', async (input) => {
    upstreamUrl = new URL(String(input));
    return new Response(JSON.stringify({ data: [], pagination: { count: 0, total_count: 0 } }), { status: 200 });
  });
  const response = await handleRequest(new Request('https://worker.example/search?q=avatar%20aang', { headers: { Origin: origin } }), { GIPHY_API_KEY: 'test' });
  assert.equal(response.status, 200);
  assert.equal(upstreamUrl.searchParams.get('q'), 'avatar aang');
  assert.equal(upstreamUrl.searchParams.get('lang'), 'es');
  assert.equal(upstreamUrl.searchParams.get('country_code'), 'AR');
});
