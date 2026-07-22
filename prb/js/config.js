/* PRB — client config. Shared cloud store via Supabase (publishable key only; secret never here).
 * Same project/table as PWM, namespaced with app='prb'. */
window.PRB = window.PRB || {};
PRB.supabase = {
  url: 'https://kcqrcyxzuskgnxnplbxb.supabase.co',
  key: 'sb_publishable_SGd6YSFMKYd_8t_uaXm-sQ_AXvawyJX',
  app: 'prb',
};

// Live book search + add (Open Library, no key needed).
PRB.bookId = (key) => 'x-' + String(key).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
PRB.api = {
  async search(query) {
    if (!query || query.trim().length < 2) return [];
    const u = new URL('https://openlibrary.org/search.json');
    u.searchParams.set('q', query);
    u.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i,subject');
    u.searchParams.set('limit', '12');
    const r = await fetch(u);
    if (!r.ok) return [];
    return ((await r.json()).docs || []).filter((d) => d.title && d.key).slice(0, 12).map((d) => ({
      key: d.key, title: d.title, author: (d.author_name || [])[0] || '', year: d.first_publish_year || null,
      cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null, subjects: d.subject || [],
    }));
  },
  async add(item) {
    let synopsis = '';
    try { const w = await fetch(`https://openlibrary.org${item.key}.json`); if (w.ok) { const d = await w.json(); if (d.description) synopsis = typeof d.description === 'string' ? d.description : (d.description.value || ''); } } catch {}
    synopsis = (synopsis || '').replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 600);
    const subj = (item.subjects || []).join(' ').toLowerCase();
    const genres = [];
    if (/dystop|distop/.test(subj)) genres.push('Distopía');
    if (/science fiction|ciencia|sci-fi|space/.test(subj)) genres.push('Ciencia ficción');
    if (/cyberpunk/.test(subj)) genres.push('Cyberpunk');
    if (/philosoph|filosof/.test(subj)) genres.push('Filosofía');
    if (/fantasy|fantas/.test(subj)) genres.push('Fantasía');
    if (/comic|manga|graphic novel/.test(subj)) genres.push('Manga');
    if (!genres.length) genres.push('Novela');
    return { id: PRB.bookId(item.key), title: item.title, author: item.author, year: item.year, genres, synopsis, cover: item.cover ? item.cover.replace('-M.jpg', '-L.jpg') : null, extra: true };
  },
};
