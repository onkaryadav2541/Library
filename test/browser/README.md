# Browser validation

This optional check verifies bookshelf persistence, search, original covers, desktop/mobile reader layout, text sizing latency, chapter navigation, keyboard page turns, bookmarks, reading-position restore, native fullscreen, and featured anime/manga flows.

Run Folio on port 5199 (or set `FOLIO_URL`). Install Playwright into a disposable tools folder or with `npm install --no-save --package-lock=false playwright`, then install its Chromium with `npx playwright install chromium`. Run:

```sh
node test/browser/check.mjs
```

If using a system Chromium, set `CHROMIUM_PATH` to its executable. The check writes four ignored screenshot files. It does not replace live external-source validation; Jikan discovery can be unavailable due to network restrictions or rate limits while featured series remain usable.

`multi-source.mjs` is a separate deterministic browser check. It simulates independently responding providers, one failed source, API-only books, duplicate anime, volume ordering/switching, and episode ordering. Set `FOLIO_URL` (default port 5210) and `CHROMIUM_PATH` as needed, then run `node test/browser/multi-source.mjs`. It uses fixture responses and does not claim live API availability.

`onsite.mjs` creates its own TXT/EPUB fixtures and verifies onsite reading, modern-title metadata without outbound Read links, private imports and persistence, EPUB spine order, inert scripts, and rejection of encrypted files. Run against `FOLIO_URL` (default port 5230); it uses the same optional Playwright setup.

`on-demand.mjs` tests a fallback cover response and opens Gutenberg book 46 through the actual server text endpoint, verifying no repository TXT file is created, no full text is prefetched, reading stays on-site, and searching keeps Read now enabled. It requires live Gutenberg connectivity and uses `FOLIO_URL` (default port 5240). Its cover and catalog metadata are fixtures; the text request is live.
