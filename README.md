# Folio

An aesthetic online public-domain library with animated book covers, genre browsing, title/author search, a personal bookshelf, reading history, and a responsive book-style reader.

## Run

Requires Node.js 24.5+. No dependencies or install step.

```sh
npm start
```

The server defaults to port 3000; set `PORT` to change it. Run `npm test` for integration tests.

## Reading & discovery

The starter collection includes complete public-domain texts from Project Gutenberg, mirrored by GITenberg. These are served locally and work without API access. Keep the Gutenberg license and attribution included in each text. Public-domain status varies by country; check the terms for your location before redistribution.

Choose a genre or search by title/author. Press Enter or “Discover more books” to query Gutendex's larger catalog. The Node server requests `gutendex.com` for discovery and `www.gutenberg.org` for full text. Enable these hosts in the environment network settings. The downloaded starter books remain available when the external services are unavailable. Not every catalog book has plain text, so the catalog only includes supported text formats. There is no promise of access to copyrighted modern books, manga, or anime titles.

Reading tools include page navigation, keyboard arrows, text sizing, light/dark reading themes, fullscreen, saved page bookmarks, and automatic reading-position restoration. Bookshelf, history, and progress stay in browser localStorage; there are no accounts or cross-device synchronization. Quiet mode changes the visual ambience without playing audio.

## Deployment

Run the Node server on a host supporting persistent Node processes. It serves the frontend and API routes together; a static-only host will not support remote discovery or uncached texts. This repository has not been publicly deployed. Google Fonts is optional; system fonts are used if unavailable.
