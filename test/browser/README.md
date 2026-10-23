# Browser validation

This optional check verifies bookshelf persistence, search, original covers, desktop/mobile reader layout, text sizing latency, chapter navigation, keyboard page turns, bookmarks, reading-position restore, native fullscreen, and featured anime/manga flows.

Run Folio on port 5199 (or set `FOLIO_URL`). Install Playwright into a disposable tools folder or with `npm install --no-save --package-lock=false playwright`, then install its Chromium with `npx playwright install chromium`. Run:

```sh
node test/browser/check.mjs
```

If using a system Chromium, set `CHROMIUM_PATH` to its executable. The check writes four ignored screenshot files. It does not replace live external-source validation; Jikan discovery can be unavailable due to network restrictions or rate limits while featured series remain usable.
