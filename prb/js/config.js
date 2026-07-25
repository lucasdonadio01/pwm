/* PRB — client config. Shared cloud store via Supabase (publishable key only; secret never here).
 * Same project/table as PWM, namespaced with app='prb'. */
window.PRB = window.PRB || {};
// GIF search keys (shared avatar/background picker in APPKIT). Keep in sync with WM.keys in js/config.js.
// giphy: developers.giphy.com → Create App. tenor: Google Cloud → enable "Tenor API". Empty = Wikimedia fallback.
PRB.keys = { giphy: 'KTxQd2M6L2xI6fFM7zzzfWLVi9sitJqr', tenor: '' };
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
    const q = query.trim();
    const cleanIsbn = q.replace(/[-\s]/g, '');
    const isIsbn = /^(978|979)?\d{9}[\dxX]$/i.test(cleanIsbn);

    if (isIsbn) {
      try {
        const r = await fetch(`https://openlibrary.org/isbn/${cleanIsbn}.json`);
        if (r.ok) {
          const d = await r.json();
          if (d.title) {
            let author = '';
            if (d.authors && d.authors[0] && d.authors[0].key) {
              try {
                const ar = await fetch(`https://openlibrary.org${d.authors[0].key}.json`);
                if (ar.ok) author = (await ar.json()).name || '';
              } catch {}
            }
            const cover = d.covers && d.covers[0] ? `https://covers.openlibrary.org/b/id/${d.covers[0]}-M.jpg` : null;
            const workKey = d.works && d.works[0] ? d.works[0].key : `/isbn/${cleanIsbn}`;
            return [{
              key: workKey,
              title: d.title,
              author,
              year: d.publish_date ? parseInt(d.publish_date, 10) || null : null,
              cover,
              subjects: d.subjects || [],
            }];
          }
        }
      } catch {}
    }

    const u = new URL('https://openlibrary.org/search.json');
    u.searchParams.set('q', isIsbn ? `isbn:${cleanIsbn}` : q);
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
