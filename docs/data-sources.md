# Free data sources

Folio uses six adapters with no paid subscription or embedded API credentials. Public service quotas and access policies still apply; a provider may deny anonymous requests or throttle an IP. There is no promise that every provider will be available.

| Adapter | Official documentation | What Folio requests | Reading behavior |
| --- | --- | --- | --- |
| Project Gutenberg / Gutendex | https://gutendex.com/ | Paged title/author/subject search and plain-text editions | Free text in the Folio reader |
| Open Library | https://openlibrary.org/dev/docs/api/search | Default browsing selects public ebook metadata; title searches include wider catalog metadata | Catalog information only; no outbound book-reading action |
| Google Books | https://developers.google.com/books/docs/v1/using | Free-edition metadata for browsing; broader metadata for title searches | Catalog information only; quota failures are optional, never fatal |
| AniList | https://docs.anilist.co/ | Public GraphQL anime/manga data, non-adult results, related works, official streaming episode links when supplied | Series guide / official links, not hosted scans or streams |
| Jikan | https://docs.api.jikan.moe/ | Safe-for-work MyAnimeList discovery, manga volume/chapter counts, numbered anime episode guides | Series guide / official publisher links |
| Kitsu | https://kitsu.docs.apiary.io/ | Anime/manga discovery with mappings included in one request; episode/chapter guides | Third independent series source; adult entries are excluded |

## Broad collections without downloading the catalog

Book records are fetched from API pages for genres including romance, thriller, mystery, fantasy, adventure, science, history, nonfiction, and reference. There is no need for a separate romance-only API. The existing downloaded starter library is retained as a fallback; expanding the catalog does not write book files to the repository. The providers do not imply that modern copyrighted books or manga volumes are all freely readable.

`GET /api/discover?provider=openlibrary&kind=book&genre=romance&page=1`

`GET /api/discover?provider=anilist&kind=anime&q=Naruto&page=1`

`GET /api/series-details?provider=jikan&kind=anime&id=20&page=1`

`GET /api/providers` lists the configured adapters and supported collection types.

Every discovery response has `provider`, `books`, `hasMore`, `total`, and `page`. The server adds `cache: fresh | hit | stale`. Totals are source-specific and may include overlapping editions, so the interface does not add them together into a misleading unique-book count.

## Speed and failure isolation

- Each source is requested independently. Results appear when that source responds.
- Provider requests time out after 4.5 seconds. The browser allows a little extra time for the local server.
- Searches debounce for 450 milliseconds and cancel stale client requests.
- Duplicate requests share one in-flight server request.
- Fresh metadata is reused for five minutes. Stale metadata can be served for a day while a background refresh runs.
- Metadata cache files live under the operating system's temporary `folio-api-v5` folder, outside the repository. The cache is memory-bounded and periodically pruned on disk. Browser session metadata is bounded separately.
- Failed searches have a short cooldown. A Retry button lets the user retry unavailable sources without refetching successful ones.
- The grid renders at most 24 cards per result page, regardless of the catalog size. Covers load lazily.
- Plain-text reading continues to measure only the visible pages. The provider changes do not re-paginate the entire book.

## Editions, volumes, and reading order

Cross-source book editions are merged conservatively by title and author. Different numbered volumes remain distinct. Volume information is parsed from explicit `Vol.`, `Volume`, `Book`, or `Part` labels, including Roman numerals. Google metadata supplies an explicit display number when present. The volume picker sorts numerically (`1, 2, 10`) and shows only volumes actually found in the current results. Find more volumes searches the base series title; it does not invent missing volumes.

Anime/manga metadata uses MyAnimeList IDs when available to merge the same series across AniList, Jikan, and Kitsu. Anime episode numbers sort numerically. Source-supplied prequels, sequels, and side stories are labelled; release dates are used only when supplied. An episode guide link is not labelled as a free stream. Manga volume/chapter counts are informational: the app does not fabricate volume files or claim every copyrighted chapter is available.

## Outbound hosts

The Node server needs `gutendex.com`, `www.gutenberg.org`, `openlibrary.org`, `www.googleapis.com`, `graphql.anilist.co`, `api.jikan.moe`, and `kitsu.io` / `kitsu.app`. The browser loads covers from the providers' image hosts, including `covers.openlibrary.org`, `cdn.myanimelist.net`, `s4.anilist.co`, and `media.kitsu.io` / `media.kitsu.app`.

## On-site reading policy

Read now is the default and includes only actual in-app text. Searching preserves Read now. Metadata-only editions are shown only when the visitor explicitly turns that filter off. No book listing has an external Read button or an automatic redirect. Personal EPUB/TXT imports stay in browser IndexedDB; they are private to that browser and do not provide a public distribution license. Gutenberg text and private imports use Folio’s own reader. Source citations remain optional attribution links.

## On-demand full text and covers

`/api/read?id=<Gutenberg ID>` fetches a selected readable book on demand and compresses its response. No manual TXT import or per-title repository file is needed. Existing local texts are an optional fallback. The remote text/metadata response cache is bounded to 24 MB.

`/api/cover?url=<encoded source image URL>` accepts only HTTPS image-provider hosts, validates redirect destinations and content type, caps each image at 1 MB, and caches at most 8 MB. It limits upstream concurrency to four requests. Cover data is not used to infer reading rights.
