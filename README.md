# Folio

An API-driven free library with original book covers, six discovery sources, ordered volumes and episode guides, and a fast book-style reader.

## See the website on Windows

Open PowerShell **inside this repository**, then run:

```powershell
git pull origin main
$env:PORT = "5199"
npm start
```

Open **http://127.0.0.1:5199** in your browser. Keep the server terminal running. Stop with Ctrl+C. There are no dependencies to install. Node 22+ is supported, including Node 23; the startup command no longer requires the newer `--use-env-proxy` flag. The Windows path handling uses platform-aware containment checks.

On other platforms, run `npm start` (port 3000 by default), or set `PORT` to another available port.

## API-driven collections

Folio searches **six free-source adapters**: Project Gutenberg, Open Library, Google Books, AniList, Jikan, and Kitsu. Books use the first three; anime and manga use the latter three. Sources load independently with per-source status, search caching, fallback, and retry. No paid subscription or embedded API key is required; public provider quotas still apply.

Romance, thriller, mystery, fantasy, nonfiction, reference, and other genres search the online catalogs. Read now shows only books with text that Folio can render. Searches also include catalog-only titles, clearly marked when their full text is unavailable. Book clicks stay in Folio. Catalog-only listings have an Add my copy action instead of redirecting readers to another library. The existing 48 downloaded books remain an instant fallback. **Adding collection coverage does not require adding files to `public/books/`.**

Anime/manga discovery includes volume/chapter/episode counts when available, numerically ordered episode guides, source-provided related series, and official reading links. It does not promise unlimited free copyrighted manga or video. Real source quotas and regional availability apply.

Numbered books have a volume picker. Volume I / II / X and 1 / 2 / 10 sort numerically; different volumes remain separate when duplicate editions are merged. Only volumes actually found in the sources are offered. Find more volumes searches for the rest of a series.

The result grid renders 24 cards per page. Searches are debounced, stale requests are cancelled, and server metadata uses a persistent temporary cache with stale-while-revalidate behavior. A slow source does not block faster results.

See [Data sources, behavior, and API documentation](docs/data-sources.md) for source contracts, limitations, caching, and endpoint examples.

## Reader

The responsive reader uses two pages on desktop and one page on mobile. It measures **only the current spread**, never the entire novel. Changing fonts preserves the current character position and does not re-layout thousands of pages. Previously measured spreads and recently opened texts are cached in the browser.

Tools include adjustable fonts, light/dark reading themes, chapter navigation where markers exist, position seeking, keyboard arrows, bookmarks, and native fullscreen with an expanded-layout fallback. Personal EPUB/TXT books are stored in IndexedDB; bookshelf, history, bookmarks, and reading progress are stored locally in the browser; there are no user accounts or cross-device synchronization. Quiet mode changes the visual ambience without playing audio. Reduced-motion preferences are respected.

## Your own books and modern titles

Use **Add your book** to open a DRM-free EPUB or UTF-8 TXT file (up to 12 MB). Text stays on the user's device in browser storage and opens in the same Folio reader; it is never uploaded. EPUB content follows its package spine, is extracted in a worker with expansion limits, and is treated as inert text. Scripts are stripped and encrypted EPUBs are rejected. This supports text-based EPUBs, not fixed-layout picture books, DRM, or PDF.

Private imports do not publish a book to other visitors. To offer modern copyrighted works such as Paulo Coelho's *The Alchemist* to all visitors, the operator must obtain a licensed full-text catalog or distribution rights. Catalog APIs supply metadata, not those rights. The app does not claim that an unavailable title can be read for free.

## Static preview

Serving `public/` with a static server supports downloaded books, covers, reader tools, and featured series. The client attempts direct requests for online catalogs, subject to each source's CORS settings. **Use `npm start` for complete API-backed discovery and uncached text reading.** A static-only hosting platform cannot run the backend routes.

## Verify

```sh
npm test
```

The dependency-free Node suite covers Windows/Linux paths, assets, text reading, source adapters, free-access filtering, cache persistence and fallback, deduplication, volume/episode order, and API validation. Adapter tests use representative fixtures so provider outages do not turn local tests into random failures. Live connectivity is checked separately. Optional browser tests are described in `test/browser/README.md`; they require Playwright and Chromium and run separately from `npm test`.

## Sources & deployment

Downloaded text and cover metadata come from Project Gutenberg / Gutendex; the original 12 texts were sourced through the GITenberg mirror. The Gutenberg license and attribution remain in every text file, accessible through the reader's source link. Book covers are source edition artwork, not AI-generated images. Public-domain status varies by country; check the source edition's terms in your location. Featured-series descriptions are brief editorial summaries; covers and live series metadata are supplied by Open Library / MyAnimeList / Jikan, with source links.

For deployment, use a host supporting a persistent Node process and set the start command to `npm start`. Outbound source and cover hosts are listed in `docs/data-sources.md`. Modern Node enables injected proxy settings when that API is available; older Node continues with standard direct networking. Keep TLS verification enabled. There is no public deployment created by this repository.
