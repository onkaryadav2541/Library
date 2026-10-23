# Folio

A free online library with original book-cover images, 48 downloaded books, live Project Gutenberg discovery, manga/anime discovery, and a fast book-style reader.

## See the website on Windows

Open PowerShell **inside this repository**, then run:

```powershell
git pull origin main
$env:PORT = "5199"
npm start
```

Open **http://127.0.0.1:5199** in your browser. Keep the server terminal running. Stop with Ctrl+C. There are no dependencies to install. Node 22+ is supported, including Node 23; the startup command no longer requires the newer `--use-env-proxy` flag. The Windows path handling uses platform-aware containment checks.

On other platforms, run `npm start` (port 3000 by default), or set `PORT` to another available port.

## Collections

- **Books:** 48 complete downloaded public-domain texts and source cover images are available immediately. Search, genre filters, and Explore more query Gutendex's larger Project Gutenberg catalog (over 79,000 catalog records at development time). Not every record has a readable plain-text edition, so results are filtered for supported formats. The full server retrieves uncached book text and caches it. External catalog size and availability can change.
- **Manga:** a featured collection plus live, safe-for-work Jikan search. Series details link to official publishers for chapters. Free access depends on the title, publisher, and region; the app does not host copyrighted manga scans or promise every chapter is free.
- **Anime:** a series guide with descriptions and MyAnimeList information via Jikan. Anime is not a book format; this collection does not stream video.

API keys and accounts are not required. The external sources must be reachable from the computer running the server. Jikan has rate limits; requests are cached and searches are debounced. Catalog errors leave the downloaded books and featured series available.

## Reader

The responsive reader uses two pages on desktop and one page on mobile. It measures **only the current spread**, never the entire novel. Changing fonts preserves the current character position and does not re-layout thousands of pages. Previously measured spreads and recently opened texts are cached in the browser.

Tools include adjustable fonts, light/dark reading themes, chapter navigation where markers exist, position seeking, keyboard arrows, bookmarks, and native fullscreen with an expanded-layout fallback. Bookshelf, history, bookmarks, and reading progress are stored locally in the browser; there are no user accounts or cross-device synchronization. Quiet mode changes the visual ambience without playing audio. Reduced-motion preferences are respected.

## Static preview

Serving `public/` with a static server supports downloaded books, covers, reader tools, and featured series. The client attempts direct requests for online catalogs, subject to each source's CORS settings. **Use `npm start` for complete API-backed discovery and uncached text reading.** A static-only hosting platform cannot run the backend routes.

## Verify

```sh
npm test
```

The dependency-free Node test suite covers Windows/Linux path handling, application assets, full local texts, API validation, ETags, gzip, and local text retrieval. Optional browser tests are described in `test/browser/README.md`; they require Playwright and Chromium and run separately from `npm test`.

## Sources & deployment

Downloaded text and cover metadata come from Project Gutenberg / Gutendex; the original 12 texts were sourced through the GITenberg mirror. The Gutenberg license and attribution remain in every text file, accessible through the reader's source link. Book covers are source edition artwork, not AI-generated images. Public-domain status varies by country; check the source edition's terms in your location. Featured-series descriptions are brief editorial summaries; covers and live series metadata are supplied by Open Library / MyAnimeList / Jikan, with source links.

For deployment, use a host supporting a persistent Node process and set the start command to `npm start`. Required outbound hosts: `gutendex.com`, `www.gutenberg.org`, `api.jikan.moe`; remote series covers use `covers.openlibrary.org` and `cdn.myanimelist.net`. Modern Node enables injected proxy settings when that API is available; older Node continues with standard direct networking. Keep TLS verification enabled. There is no public deployment created by this repository.
