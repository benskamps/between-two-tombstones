# Between Two Tombstones

At any cemetery, Between Two Tombstones finds the graves with the most interesting stories, walks you through them as a tour, and tells you how those people lived.

Built solo for [Hackyard](https://hackyard.tech) Yard #5, theme "Haunted", Oct 19–23, 2026.

Live: https://between-two-tombstones.vercel.app (an installable web app; no account).

## Prior work

The idea and the written spec (including how the Stamp Kit should turn a headstone photo into a rubbing) were drafted on Oct 18, 2026, before kickoff. No code was written before the build week. Every line in this repo was written after kickoff (Mon Oct 19, 18:00 UTC); the repo itself was created Oct 20, 00:49 UTC. Frameworks and libraries are installed as normal dependencies.

## What was built during the event

Everything below is in this repo; the first commit is from Oct 20, 01:56 UTC (`git log`). `PLAN.md` tracks each piece and how it was checked.

- **Tours** (`/cemetery/<Wikidata ID>`): up to 80 people buried at the cemetery, from Wikidata, each with the intro of their English Wikipedia article. Modes: greatest hits (the default, 12 stops), walk through time, and a walking route once 3 graves have a location. Each card links to Find a Grave.
- **Finding a cemetery**: "I'm here. Haunt me." asks for your location on the tap and lists cemeteries within 10 km (`/near`); or search by name (`/search`).
- **Offline**: "Download this tour" keeps the tour on the phone (a service worker and IndexedDB). "I found it" saves a grave's position on the phone; those pins make the walking route.
- **Stamp Kit** (`/stamp`): a headstone photo is straightened in a Web Worker and turned into a rubbing, an ink stamp and a postage stamp whose value is the person's age at death, plus a kit sheet and a story-size image. All of it happens on the phone.
- **Read with Claude**: on a tap, two images derived from the photo go to `/api/read-stone`, which asks Claude for a transcription. Unreadable characters come back as `[?]`, and dates that aren't in the transcription are removed. Rate limits per phone and per network, and a daily spending cap.
- **Spirit box** (`/spirit`): radio static with low text-to-speech voices built from the names of people buried at that cemetery who died 75 or more years ago, with captions.
- **Séance**: every phone that opens the same link speaks the same words at the same second (a shared seed and the server's clock; no server state).
- **Games** (`/games`): Tombstone Bingo with the meanings of carved symbols; a graveyard party, where everyone with the link gets the same card; an EVP recorder that plays your recording back reversed and slowed.
- **Haunted Calendar** (`/calendar`): subscribe to a cemetery and your calendar gets the yearly death-days (optionally birthdays) of people buried there who died 25 or more years ago.
- **Gravitator** (`/gravitator`): a swipe deck of public cemeteries near you, for planning a visit, or around Atlanta, Savannah, New Orleans and Sleepy Hollow without sharing a location.
- **Field kit and Ghost pass** (`/kit`): the tools for the graveyard you picked, locked until you pick one. The Ghost pass is for anyone with no graveyard nearby: it opens the kit at Sleepy Hollow, says "Ghost pass" wherever the haunt shows, and offers a sample headstone in the Stamp Kit.
- **Share links** (`/s/…`): links that carry only Wikidata IDs and a room code, with link-preview and story-size images. Every page re-checks Wikidata before naming anyone.

Respect rules (`lib/respect.ts`): the spirit box and the séance use only people who died 75 or more years ago. Anyone who died within 25 years, or whose death date is unknown, gets a plain card with no spooky effects and stays out of calendars.

## Writeup (484 characters)

**DRAFT, Ben to approve.**

> Between Two Tombstones is a phone companion for real cemeteries. Pick one near you or by name and it builds a tour of the graves with the best stories, from Wikidata and Wikipedia; save it and it works without signal. Photograph a headstone to get a rubbing and two stamps, made on the phone, or let Claude read worn carving. A spirit box speaks the names of people buried there who died 75+ years ago, in sync across friends' phones. Plus bingo, a death-day calendar and share links.

## Model declaration

(Ben's wording)

## Data and licenses

| Source | What the app uses | License | How the app credits it |
|---|---|---|---|
| [Wikidata](https://www.wikidata.org) | Cemeteries, who is buried there, dates, occupations, Commons file names, Find a Grave IDs | CC0 1.0 | Site footer (`components/shell/SiteFooter.tsx`) |
| [Wikipedia](https://en.wikipedia.org) (English) | The intro of each person's article, as their story | CC BY-SA 4.0 | "From Wikipedia, CC BY-SA 4.0", linked to the article, on every story card (`components/tour/StoryCard.tsx:202-207`) and share page (`components/share/ShareLanding.tsx:108`). Gravitator bios also link the license (`components/gravitator/ProfileCard.tsx:68-80`). Each calendar event carries the credit and the article link (`lib/calendar/feed.ts:210`) |
| [Wikimedia Commons](https://commons.wikimedia.org) | Grave photos and portraits, loaded from Wikimedia's servers (not copied into this repo) | Each file's own license | "Photo: Wikimedia Commons (author and license on the file page)", linked to the file page (`components/tour/GravePhoto.tsx:61-71`). The Gravitator names and links the file (`components/gravitator/ProfileCard.tsx:184-188`) |
| [OpenStreetMap](https://www.openstreetmap.org) via Overpass | Optional: cemeteries near you that Wikidata lacks, merged into `/near` when Overpass answers within 4 s (`lib/data/overpass.ts`). From Vercel it usually doesn't, and `/near` says so | ODbL, © OpenStreetMap contributors | Site footer, linked to openstreetmap.org/copyright |
| Fonts: IM Fell English, Atkinson Hyperlegible, Michroma | Page text (through `next/font`) and the share images (`assets/fonts/`) | SIL Open Font License 1.1 | License texts in `assets/fonts/OFL-*.txt`; sources in `assets/fonts/LICENSES.md` |
| Test photos | Three headstone photos from Commons, used only as test inputs | CC BY 2.0, public domain, CC BY-SA 3.0 | Authors and licenses in `tests/fixtures/stones/LICENSES.md` |
| Sample headstone | Washington Irving's grave (`public/samples/washington-irving-grave.jpg`, a copy of the test fixture), loaded by the Stamp Kit's "Use a sample" button | CC BY 2.0, Chris Kirkman | Credited under the photo picker whenever the sample is in use, linked to the Commons file page (`components/stamp/StampKit.tsx`) |
| [Find a Grave](https://www.findagrave.com) | Outbound links only: a memorial or cemetery page from the ID Wikidata stores, else a name search (`lib/tour/links.ts`) | — | Nothing is fetched or scraped |

## How to run it

Needs Node 22+ and pnpm 10.

```sh
pnpm install
pnpm dev                      # http://localhost:3000
pnpm check                    # lint, typecheck, unit tests
pnpm build && pnpm start      # production build
pnpm exec playwright test     # e2e against the local production build (run pnpm build first)
BASE_URL=https://between-two-tombstones.vercel.app pnpm exec playwright test   # e2e against prod
```

Behind an HTTPS proxy, Node's `fetch` needs `NODE_USE_ENV_PROXY=1` to reach Wikidata.

Environment variables, all optional locally:

- `ANTHROPIC_API_KEY`: turns on Read with Claude. Without it the route answers 503 and the page says reading is switched off.
- `CLAUDE_DAILY_USD_CAP`: the daily Claude budget per server instance, default 5.
- `DEVICE_COOKIE_SECRET`: signs the rate-limit cookie; a random one per process if unset.
- `NEXT_PUBLIC_SITE_URL`: the canonical origin for links and preview images.
- Test hooks: `DISABLE_WIKIDATA=1` (also `DISABLE_WIKIPEDIA=1`, `DISABLE_OPENSTREETMAP=1`) makes that source fail as if it were down; `SIMULATE_SLOW_BURIALS=<QID,…>` makes those cemeteries time out.

The offline sample data in `data/snapshots/` is generated, never edited by hand: `NODE_USE_ENV_PROXY=1 node scripts/snapshot.mjs Q360779 sleepy-hollow`.

More: `PLAN.md` (what's done and how it was checked), `docs/DEMO.md` (the demo video plan), `docs/ADVERSARIAL.md` (promises, attack surface, known issues).
