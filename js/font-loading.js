(() => {
  // Match the URLs used by each destination's CSS and HTML preloads.
  const fontsByPage = {
    '/': [['Zodiak', '/fonts/zodiak-variable.fbc0b605217b.woff2']],
    '/projects/': [['Tanker', '/fonts/tanker-regular.98d0d534c2b6.woff2']],
    '/sandwich/': [['Comico', '/sandwich/fonts/comico-regular.ff3e3214ef73.woff2']],
    '/pride/': [['Aktura', '/fonts/aktura-regular.537e4b41ea19.woff2']],
    '/pixel/': [
      ['Press Start 2P', '/fonts/press-start-2p-400-latin.42144b97bd29.woff2'],
      ['Space Mono', '/fonts/space-mono-400-latin.e0c8e616bda2.woff2'],
      ['Space Mono', '/fonts/space-mono-700-latin.af7cf6d2b897.woff2', '700'],
    ],
    '/blog/': [
      ['Maison Neue', '/blog/fonts/3e0a37bc36e5a3325e58.woff2'],
      ['Roboto Mono', '/blog/fonts/535bc89d4af715503b01.woff2'],
    ],
  };
  const requested = new Set();
  const currentPage = location.pathname.replace(/index\.html$/, '');

  function warmFonts(pathname) {
    const connection = navigator.connection;
    if (!('FontFace' in window) || document.readyState !== 'complete' ||
        document.visibilityState !== 'visible' || connection?.saveData ||
        ['slow-2g', '2g'].includes(connection?.effectiveType) || pathname === currentPage) return;

    for (const [family, url, weight = '400'] of fontsByPage[pathname] || []) {
      if (requested.has(url)) continue;
      requested.add(url);
      // A detached face uses the browser's normal font cache without changing
      // this page's typography or delaying document.fonts.ready.
      new FontFace(family, `url("${url}")`, { weight }).load().catch(() => {
        requested.delete(url);
      });
    }
  }

  function warmLink(event) {
    const link = event.target.closest('a[href]');
    if (!link || (event.type === 'pointerover' && event.pointerType === 'touch')) return;
    const url = new URL(link.href);
    if (url.origin === location.origin) warmFonts(url.pathname.replace(/index\.html$/, ''));
  }

  document.addEventListener('pointerover', warmLink);
  document.addEventListener('focusin', warmLink);

  function warmNextPage() {
    if (currentPage !== '/') return;
    // Only the likely next page is warmed automatically: Tanker is about 19 KB.
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => warmFonts('/projects/'));
    } else {
      setTimeout(() => warmFonts('/projects/'), 1000);
    }
  }

  if (document.readyState === 'complete') warmNextPage();
  else window.addEventListener('load', warmNextPage, { once: true });
})();
