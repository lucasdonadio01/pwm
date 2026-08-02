const ALLOWED_ORIGINS = new Set([
  'https://lucasdonadio01.github.io',
  'http://127.0.0.1:4174',
  'http://localhost:4174',
]);

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  },
});

const gifUrl = (images, ...names) => {
  for (const name of names) {
    const url = images?.[name]?.url;
    if (typeof url === 'string' && url.startsWith('https://')) return url;
  }
  return '';
};

export function normalizeGiphy(payload, offset) {
  const items = (payload?.data || []).map((gif) => ({
    title: gif.title || 'GIF',
    url: gifUrl(gif.images, 'downsized_medium', 'original'),
    preview: gifUrl(gif.images, 'fixed_width_small', 'fixed_width', 'preview_gif'),
    provider: 'giphy',
  })).filter((item) => item.url && item.preview);
  const page = payload?.pagination || {};
  const consumed = Number(page.count) || items.length;
  const total = Number(page.total_count) || 0;
  const next = offset + consumed < total ? offset + consumed : null;
  return { items, next };
}

export async function handleRequest(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!ALLOWED_ORIGINS.has(origin)) return json({ error: 'Origen no permitido.' }, 403, 'null');
  if (request.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    },
  });
  if (request.method !== 'GET') return json({ error: 'Método no permitido.' }, 405, origin);

  const incoming = new URL(request.url);
  if (incoming.pathname === '/health') return json({ ok: true }, 200, origin);
  if (incoming.pathname !== '/search') return json({ error: 'Ruta inexistente.' }, 404, origin);

  const query = (incoming.searchParams.get('q') || '').trim().slice(0, 50);
  const offset = Math.min(4999, Math.max(0, Number.parseInt(incoming.searchParams.get('offset') || '0', 10) || 0));
  if (query.length < 2) return json({ error: 'La búsqueda necesita al menos 2 caracteres.' }, 400, origin);
  if (!env.GIPHY_API_KEY) return json({ error: 'Proveedor no configurado.' }, 503, origin);

  const upstreamUrl = new URL('https://api.giphy.com/v1/gifs/search');
  upstreamUrl.search = new URLSearchParams({
    api_key: env.GIPHY_API_KEY,
    q: query,
    limit: '24',
    offset: String(offset),
    rating: 'pg-13',
    lang: 'es',
    country_code: 'AR',
    bundle: 'messaging_non_clips',
  });

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
      cf: { cacheEverything: true, cacheTtl: 600 },
    });
    if (!upstream.ok) return json({ error: 'GIPHY no respondió correctamente.' }, 502, origin);
    const payload = await upstream.json();
    return json(normalizeGiphy(payload, offset), 200, origin);
  } catch (error) {
    console.error(JSON.stringify({ event: 'giphy_fetch_failed', message: error instanceof Error ? error.message : String(error) }));
    return json({ error: 'No se pudo conectar con GIPHY.' }, 502, origin);
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
