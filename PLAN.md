# PLAN.md — the one ledger

Between Two Tombstones · Hackyard Yard #5 ("Haunted") · solo · open model

| | UTC | Ben (EDT) |
|---|---|---|
| Ship deadline (submissions lock) | **Fri Oct 23, 18:00** | Fri 2:00 PM |
| Feature freeze: fixes, stranger pass, demo pack only | **Fri Oct 23, 16:30** | Fri 12:30 PM |
| Voting closes | Sun Oct 25, 22:00 | Sun 6:00 PM |

**Finish line:** every line of the readiness contract is green on the production URL and the wrap seal is in `personal-infra/seals/`. Then stop. Remaining P1/P2 items become the Halloween-week kickoff.

**Order (outranks every lane):** real experience first, built for real, then the viral layer. Lane 5 starts only after a stranger passes Lanes 2+3 unaided.

Status keys: ⬜ not started · 🟨 in progress · ✅ verified (how is written next to it) · ❌ failed · ❓ couldn't check

---

## Readiness contract (Demo-Ready Gate)

Checked on **prod**, by script or by eye. The verdict comes from the stranger pass, never from green CI. A crash, refusal or unreadable result counts as ❓, not ✅.

| # | Assertion | How it's checked | Status |
|---|---|---|---|
| 1 | Anonymous GET of the prod `*.vercel.app` URL returns 200, not 401 (custom domain on hold) | `curl -so /dev/null -w '%{http_code}'` | ⬜ |
| 2 | A stranger at an unfamiliar cemetery sees 5+ named graves with stories within 20 s on mobile data | Ben's stranger, stopwatch | ⬜ |
| 3 | With the network off, a downloaded tour opens and every card reads | Playwright `context.setOffline(true)` + by eye on a phone | ⬜ |
| 4 | A real headstone photo becomes all three stamps in under 5 s on a mid-range phone | Ben's phone, stopwatch; Playwright with CPU throttling as a proxy | ⬜ |
| 5 | "Read with Claude" on a real stone returns a transcript with no invented dates (spot-check 3 stones) | 3 photos, compared by eye against the stone | ⬜ |
| 6 | A shared stamp link pasted into iMessage and Slack shows the OG card and lands on a working page | Ben, two apps | ⬜ |
| 7 | A second phone joins a graveyard party from a link and sees the same bingo card within 10 s | Playwright, two browser contexts; then two real phones | ⬜ |
| 8 | With Wikidata switched off (`DISABLE_WIKIDATA=1`), the app names the failure; never an empty "nothing here" | Playwright against a preview with the flag | ⬜ |
| 9 | Camera, mic and geolocation aren't blocked by Permissions-Policy on prod | Playwright reads the header + `document.featurePolicy` / permission query | ⬜ |
| 10 | `/robots.txt`, `/sitemap.xml`, `/llms.txt` live; `curl -A ClaudeBot` and `-A GPTBot` get 200; JSON-LD parses | curl + JSON.parse of every `application/ld+json` block | ⬜ |
| 11 | Lighthouse mobile: Accessibility ≥ 95, Performance ≥ 85; installable as a PWA | Lighthouse CLI; installability via CDP `Page.getInstallabilityErrors` (Lighthouse 12+ dropped the PWA category) | ⬜ |

---

## Hour 0 results (verified live 2026-10-20, 01:20–01:55 UTC)

| Check | Result |
|---|---|
| P535 | "Find a Grave memorial ID" ✅ |
| P2025 | "Find a Grave cemetery ID" ✅ |
| Q39614 | "cemetery" ✅ — both test cemeteries are `wdt:P31 wd:Q39614` |
| Sleepy Hollow Cemetery | **Q360779**, P2025 = 66311, has P625 |
| Lake View Cemetery (Seattle) | **Q872253**, P2025 = 76890, has P625. 37 Wikidata items share the exact name "Lake View Cemetery": search results must show the town |
| Oakland Cemetery (Atlanta), the filming location | **Q2008469**: 115 burials, 95 with enwiki, 7 grave photos |

Burial field coverage (people with a value / people buried there):

| Field | Sleepy Hollow (271) | Lake View (103) |
|---|---|---|
| P569 birth / P570 death | 270 / 270 | 103 / 103 |
| P509 cause of death | 29 | 8 |
| P1196 manner of death | 33 | 6 |
| P106 occupation | 204 | 85 |
| P18 image | 167 | 71 |
| P1442 image of grave | 24 | 3 |
| P535 Find a Grave memorial ID | 250 | 99 |
| enwiki article | 169 | 68 |
| **P625 grave coordinates** (qualifier on P119, or on the person) | **0** | **1** |

What it means:
- **Wikidata almost never knows where a grave is.** The walking-route mode will rarely trigger from Wikidata alone. Route stops come from the "I found it" pins (on the phone for now, decision 8). "Walk through time" and "greatest hits" are the realistic defaults.
- Cause and manner of death are sparse (about 10%). The "unusual death" tag will be rare; that's fine.
- Find a Grave coverage is excellent: links will exist for ~90% of cards.
- **Use best-rank statements.** Margaret Mitchell (Q173540) has a preferred Nov 8 and a normal-rank Nov 9 birth date; SAMPLE over all ranks showed the wrong one. `scripts/burials.mjs` now filters `wikibase:BestRank`; snapshots regenerated 10/20 02:42 UTC.
- **Wikidata grave photos can be wrong.** Mitchell's P1442 is another Margaret Ann Mitchell's stone in Hiland Cemetery; Lane 2 drops grave photos whose file title names a different cemetery.
- **Rate limits are real from shared IPs.** `www.wikidata.org` answered 429 on the 3rd request. Wikipedia's per-page REST summary answered 429 with `Retry-After` ≈ 50 s. Batched intro extracts (`action=query&prop=extracts&exintro&exlimit=20`) fetched 80 summaries in 4 requests. The SPARQL endpoint was fine.
- **Overpass: ❓ couldn't check.** `overpass-api.de`, `overpass.kumi.systems` and `overpass.private.coffee` all reset or time out from the build container (container network, not our code). Re-check from the first Vercel deploy. Until then, Overpass is optional enrichment and "nearby" must work on Wikidata alone.
- Snapshots committed: `data/snapshots/sleepy-hollow.json` and `data/snapshots/oakland-atlanta.json` (80 people each, all with Wikipedia text; pulled by `scripts/snapshot.mjs`; no hand-typed facts). Sleepy Hollow has Irving, Carnegie, Chrysler, Gompers, Helmsley and William Rockefeller.
- Prior-work disclosure is in `README.md`.

---

## Decisions

| # | Date | Decision |
|---|---|---|
| 1 | 10/20 | **Stack:** Next.js 16.4 (App Router, TypeScript strict, Cache Components on) on Vercel, Hobby team `benjamin-schippers-projects`. Claude API only from server routes. Installable PWA, no native app. `claude-sonnet-5-5` reads stones (vision); `claude-haiku-5-5` does short text jobs. Load the `claude-api` skill before writing any Claude call. Next 16 differs from older docs: read `node_modules/next/dist/docs/` first. |
| 1a | 10/20 | **No database for the hackathon** (Ben: no new Supabase project; sharing an existing one would need project-wide auth changes). Supersedes the Supabase parts of the original plan. Revisit when Lane 5 starts. |
| 2 | 10/20 | **Data:** Wikidata (SPARQL) + Wikipedia (batched extracts, decision 10) + OpenStreetMap (Overpass, optional). Find a Grave is outbound links only, from P535/P2025, with a name-search fallback. Never scrape it. |
| 3 | 10/20 | **No signup.** Without Supabase there's no anonymous auth. Rate limits key on IP plus an HMAC-signed random device cookie. Email magic link is deferred. |
| 4 | 10/20 | **Photos stay on the phone.** The raw photo leaves only on "Read with Claude", goes to our route, and is never stored or logged. Generated stamps are shared from the phone (Web Share with files); nothing is uploaded. |
| 5 | 10/20 | **Respect rules** live in `lib/respect.ts`: spirit box only uses people dead 75+ years; deaths within 25 years (or unknown) get the plain card with no spooky effects. Etiquette card on first run (`components/shell/EtiquetteCard.tsx`). |
| 6 | 10/20 | **Name:** Between Two Tombstones, subtitle "Macy's Graveyard Companion". **Domain on hold** (Ben): ship on the `*.vercel.app` production URL; canonical = that URL via `NEXT_PUBLIC_SITE_URL` until a domain is bought. |
| 7 | 10/20 | **Stamp Kit behavior is settled** (Lane 3 spec). Written fresh from the spec: **new code only**, per Hackyard rules (Ben). No pre-kickoff code enters the repo. |
| 8 | 10/20 | **Stateless P0.** Wikidata/Wikipedia results cached with `'use cache: remote'` + `cacheLife` (7 days), replacing the Supabase cache. Party = a seed in the link (same bingo card on every phone, no realtime). Share links carry their own signed data. "I found it" pins live in IndexedDB on the phone; the shared crowd map waits for a database. |
| 9 | 10/20 | **Demo = video.** Hackyard submission is: public repo, writeup ≤ 500 chars, model declaration, demo video (required for Yard #5), screenshot. Lane 6 is a shoot plan, not a venue demo. Filming at **Oakland Cemetery, Atlanta**. |
| 10 | 10/20 | **Wikipedia summaries in batches of 20** via the Action API (`prop=extracts&exintro&explaintext&exlimit=20&redirects`). Never one request per card. |
| 11 | 10/20 | **Overpass is optional enrichment** behind mirror fallback (`overpass-api.de` → `overpass.kumi.systems` → `overpass.private.coffee`), merged by QID or name. If all fail, say so by name and still show the Wikidata results. |
| 12 | 10/20 | **Claude spend:** hard cap = a dedicated Anthropic API key with a workspace spend limit (Ben's click). `CLAUDE_DAILY_USD_CAP` is a best-effort soft cap per server instance (no database to count globally). Results are cached by image hash. |
| 13 | 10/20 | **Wikimedia User-Agent** = `BetweenTwoTombstones/0.1 (https://github.com/benskamps/between-two-tombstones)` (`lib/site.ts`). The repo URL is the contact. |
| 15 | 10/20 | **Gravitator (Ben's ask):** a dating-app swipe deck where the profiles are public cemeteries near you. Public only: excludes Wikidata family (Q73218016), private (Q107684101), animal (Q163778) and abandoned (Q107334193) cemeteries and anything with P576. Own palette scoped to the route: Victorian half-mourning mauve on crepe black, candle for Go now, a will-o'-the-wisp glow for matches. P1: runs in parallel, never ahead of the P0 gate. |
| 16 | 10/20 | **Haunted Calendar + Séance mode locked in (Ben).** Calendar: subscribe to a cemetery and your real calendar gets yearly death-days (optionally birthdays) of people who died 25+ years ago, each linking to their story card; unsubscribing removes it all. Séance: every phone on a party link speaks the same spirit words at the same second from a shared seed + synced clock (`/api/time`), no server state. Both P1, database-free, built in parallel. |
| 14 | 10/20 | **Production deploys are Ben's click.** The Vercel project is not connected to Git auto-deploys for production. Claude deploys previews with the CLI; Ben promotes or runs `vercel --prod`. |

---

## Lanes

Every item: tier, acceptance line (machine-checkable where possible), status. Builders own only the files listed for their lane. Shared files (`app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `components/shell/**`, `lib/types.ts`, `lib/respect.ts`, `lib/site.ts`, `package.json`, `PLAN.md`) belong to the orchestrator; a builder that needs a change there says so in its report.

### Lane 0 — Ledger ✅
- P0 This file + `CLAUDE.md` pointer. ✅ (this commit)

### Lane 1 — Platform 🟨 builder merged 10/20 02:30 UTC; orchestrator owns L1.2, L1.6
Owns: `next.config.ts`, `.github/workflows/**`, `app/robots.ts`, `app/sitemap.ts`, `app/manifest.ts`, `app/icon*`, `app/apple-icon*`, `app/opengraph-image*`, `public/llms.txt`, `public/icons/**`, `lib/seo/**`, `vercel.json`, `tests/e2e/platform.spec.ts`.

| ID | Tier | Item | Acceptance | Status |
|---|---|---|---|---|
| L1.1 | P0 | One CI workflow per the house CI budget (`personal-infra/AUTONOMY.md:244`): PRs into `main` only, superseded runs cancel, every job has `timeout-minutes`, runs `pnpm check` + `pnpm build` | `.github/workflows/ci.yml` has `on.pull_request.branches: [main]`, a `concurrency` group with `cancel-in-progress: true`, `timeout-minutes` on every job | 🟨 merged 10/20; actionlint clean; first GitHub run pending on PR #1 |
| L1.2 | P0 | Vercel project created with the CLI; Deployment Protection set to `preview` **before** the first deploy | anonymous `curl` of the production URL → 200 | 🟨 project `between-two-tombstones` created 10/20 02:08 UTC; API read-back: `ssoProtection.deploymentType = preview` (was the inherited `all_except_custom_domains`), framework `nextjs`. Prod URL `https://between-two-tombstones.vercel.app`. Gate 1 waits for the first prod deploy |
| L1.3 | P0 | Security headers in `next.config.ts` `headers()` only: HSTS with preload, nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(self), geolocation=(self)` (**not** the template's `=()`), CSP with `connect-src 'self'`, `img-src 'self' https://upload.wikimedia.org https://commons.wikimedia.org blob: data:`, `font-src 'self'` (next/font self-hosts Google Fonts), `worker-src 'self' blob:`. Pick `script-src` after reading `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`, without forcing every page dynamic | `tests/e2e/platform.spec.ts` asserts each header on `/`; Gate 9 | ✅ local prod, re-verified by orchestrator 10/20: `tests/e2e/platform.spec.ts` 22/22 (exact header values, CSP directives, Wikimedia images allowed, featurePolicy allows camera/mic/geo, zero CSP violations on hydrate). script-src `self` + `unsafe-inline`: nonces would force every page dynamic (reason in `next.config.ts`). On prod: pending |
| L1.4 | P0 | PWA manifest + icons (192, 512, maskable), name/short name/theme colors | CDP `Page.getInstallabilityErrors` returns `[]` once Lane 2's service worker lands | ✅ local prod: CDP `Page.getInstallabilityErrors` = [] (asserted in platform spec); icons 192/512/maskable |
| L1.5 | P0 | SEO triple, following `personal-infra/vault/skill-mirror-win/vercel-seo-triple/SKILL.md`: `app/robots.ts` with the house AI-crawler allow-list and the Bytespider block; `app/sitemap.ts` (home, tools, sample cemeteries; Lane 5 adds `/c/*`); `public/llms.txt` served with `Cache-Control: public, max-age=3600`; JSON-LD `WebSite` + `SoftwareApplication` in a helper in `lib/seo/` | Gate 10 | ✅ local prod: robots (house allow-list, Bytespider blocked, /api/ disallowed), sitemap, llms.txt with 1h cache, WebSite + SoftwareApplication JSON-LD mounted in layout; ClaudeBot/GPTBot 200. On prod: pending |
| L1.6 | P0 | Env vars set before the merge that needs them: `NEXT_PUBLIC_SITE_URL`, `CLAUDE_DAILY_USD_CAP`, `DEVICE_COOKIE_SECRET`, `SHARE_SIGNING_SECRET`, `ANTHROPIC_API_KEY` (Ben pastes). Never in git, logs or the client bundle | `vercel env ls` shows them; `grep -r` of `.next/static` finds no secret values | 🟨 set for Production + Preview 10/20: `NEXT_PUBLIC_SITE_URL`, `CLAUDE_DAILY_USD_CAP` (=5, Ben can change), `DEVICE_COOKIE_SECRET`, `SHARE_SIGNING_SECRET` (generated, never printed). `ANTHROPIC_API_KEY` added by Ben 10/20 for Production + Preview |
| L1.7 | P1 | Vercel Web Analytics enabled for the project (`<Analytics/>` is already in the layout) | dashboard shows pageviews | ⬜ |
| L1.8 | P2 | Daily cron warming the sample cemetery caches, gated by `CRON_SECRET` | cron returns 401 without the secret, 200 with it | ⬜ |
| L1.9 | — | Domain: on hold (decision 6) | — | ⏸ |

### Lane 2 — Data + the tour (core experience) 🟨 builder dispatched 10/20 02:05 UTC (L2.1–L2.7)
Owns: `lib/data/**`, `lib/tour/**`, `app/api/cemeteries/**`, `app/near/**`, `app/search/**`, `app/cemetery/**`, `components/tour/**`, `components/offline/**`, `public/sw.js`, `tests/e2e/tour.spec.ts`. Reads `data/snapshots/*` and `lib/types.ts`.

| ID | Tier | Item | Acceptance | Status |
|---|---|---|---|---|
| L2.1 | P0 | Wikimedia client: UA from `lib/site.ts`, 15 s timeouts, 429/5xx backoff honoring `Retry-After` with ≤ 3 retries, serial per host. Burials SPARQL per `scripts/burials.mjs` (GROUP BY person, SAMPLE per field, LIMIT 80). Batched Wikipedia extracts (decision 10). Cached `'use cache: remote'` + 7-day `cacheLife` | unit tests with recorded fixtures; `curl /api/cemeteries/Q360779/burials` returns ≥ 50 people with `wikipedia.extract` | ⬜ |
| L2.2 | P0 | `/api/cemeteries/near?lat&lon` (Wikidata `wikibase:around`, DISTINCT, with the P131 place name; Overpass merge optional, decision 11), `/api/cemeteries/search?q` (mwapi EntitySearch filtered to Q39614 subclasses, with place name), `/api/cemeteries/[qid]/burials`. Errors return `{ error: { source: "Wikidata" \| "Wikipedia" \| "OpenStreetMap", message } }` with 502/503. `DISABLE_WIKIDATA=1` simulates an outage | Gate 8; `curl` near Lake View lists Lake View + the GAR cemetery once each; search "lake view cemetery" shows "Seattle" | ⬜ |
| L2.3 | P0 | "Why this grave" score + tags: famous (sitelinks), died young (< 30), lived to 95+, gone 100+ years, unusual manner of death (no boost for suicide), grave photo on file, grave location known | unit tests on snapshot people | ⬜ |
| L2.4 | P0 | Tour page `/cemetery/[qid]`: modes "Greatest hits" (default), "Walk through time", "Best walking route" (only with ≥ 3 located graves, nearest neighbor + capped 2-opt); 12 stops by default. Story card: name, dates, age, occupations, tags, Wikipedia extract + "From Wikipedia, CC BY-SA 4.0" link, Find a Grave link (P535, else name search), "Died during": epidemics/wars by date overlap, stated as timing, never as cause. Respectful style via `lib/respect.ts` | Playwright: Oakland tour shows 12 cards, each with a name and story text; a recent death renders without effects | ⬜ |
| L2.5 | P0 | `/near` and `/search` pages with honest failure ("Couldn't reach Wikidata. Try again in a minute, or open a saved tour."), never "no interesting graves" for a failed query | Gate 8 | ⬜ |
| L2.6 | P0 | Offline: `public/sw.js` (cache app shell + visited pages), "Download this tour" → IndexedDB (`idb-keyval`) with all story text; sample tours (Oakland, Sleepy Hollow) work offline from the snapshots. Wake lock while a tour is open; `watchPosition` only while a tour is active and the page is visible | Gate 3 via Playwright `setOffline(true)` | ⬜ |
| L2.7 | P0 | "I found it" on each card: saves the grave's GPS to IndexedDB on the phone; the route mode uses these pins | Playwright with mocked geolocation: pin 3 graves → "Best walking route" appears | ⬜ |
| L2.8 | P1 | Claude narration (`claude-haiku-5-5`): gets only the fetched facts, prompt forbids adding any, cached per person, labeled "Narration written by Claude from the facts above" | prompt test: no facts in output that aren't in the input set | ⬜ |
| L2.9 | P1 | "Their world": notable events their lifetime spanned | — | ⬜ |
| L2.10 | P2 | Shared crowd map of pins (needs a database) | — | ⬜ |

### Lane 3 — Stamp Kit (written fresh from this spec) 🟨 3a (L3.1 + L3.5) merged 10/20 02:40 UTC; 3b (L3.2–L3.4 + L3.6) building

Notes from 3a: Next 16 rejects `export const runtime` when `cacheComponents` is on (Node is the default), which also applies to Lane 5's OG handler. The request body cap on Vercel is about 4.5 MB, so the client keeps both images under ~4 MB. Read uses `effort: medium` and `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`, confirmed in the claude-api skill's platform table).
Owns: `lib/stamp/**`, `lib/stonemath/**`, `workers/**`, `app/stamp/**`, `app/api/read-stone/**`, `components/stamp/**`, `tests/fixtures/stones/**`, `tests/e2e/stamp.spec.ts`.

| ID | Tier | Item | Acceptance | Status |
|---|---|---|---|---|
| L3.1 | P0 | Stone math: exact y/m/d between two dates; birth worked back from the death date + "Aged 34 y'rs 2 m's 11 d's" (search ±6 days for an exact match); "in the 76th year" = 75 full years | vitest: Irving Apr 3 1783 – Nov 28 1859 = 76y 7m 25d; "died March 4, 1851, aged 34y 2m 11d" → born Dec 21, 1816 | ✅ merged 10/20; 50 vitest cases incl. Irving = 76y 7m 25d and "aged 34y 2m 11d" → Dec 21, 1816 (exact); randomized round-trips; orchestrator re-ran `pnpm check` (101 tests) |
| L3.2 | P0 | Web Worker + OffscreenCanvas pipeline: Heckbert square-to-quad homography with bilinear sampling, ≤ 1000 px long side; carving lift (luminance ÷ box blur at side/9; local threshold on deviation from local mean with a local-std floor, window side/48; modes dark letters / light letters / both edges); morphological close; union-find components; drop specks below the grit slider; **drop blobs touching the frame edge**; stroke weight dilate/erode | golden test: carving-mask pixel count of the fixture stone stays within a band | ⬜ |
| L3.3 | P0 | Renders: **rubbing** (paper + wax using the stone's own relief as texture, wax fading at the edges, carving left paper-white); **ink stamp** (double frame, header, distressed ink from low/mid/fine noise, rotated about −2°, transparent background); **postage stamp** (engraved-line screen over the contrast-boosted image, perforations, **the value is their age at death**). Plus a 1080×1350 kit sheet and a 1080×1920 story-size version | Playwright: fixture photo → three non-blank canvases; Gate 4 by stopwatch | ⬜ |
| L3.4 | P0 | `/stamp` UI: pick or take a photo (`<input type=file accept=image/* capture=environment>`); four-corner framing with a zoom loupe while dragging and arrow-key nudging; mode / grit / stroke controls; save and share (Web Share with files, fallback download) | keyboard-only run through Playwright | ⬜ |
| L3.5 | P0 | `/api/read-stone`: two images (straightened + contrast-boosted) → `claude-sonnet-5-5` → zod-validated JSON `{ people, dates, aged, epitaph, symbols: [{ name, meaning }], material, legibility }`; unreadable characters are `[?]`, never guesses. Rate limit per IP + device cookie; `CLAUDE_DAILY_USD_CAP` soft cap; cached by image hash; image never stored or logged. Clear errors when the key is missing or the cap is hit | unit test with a mocked SDK; Gate 5 on prod | 🟨 merged 10/20; 42 unit tests with mocked SDK (limits, cap, cache, sizes, refusals, timeouts); local prod: no key → 503 `no_key` (orchestrator re-checked). Real read (Gate 5) waits for a deploy with the key in Preview/Production |
| L3.6 | P0 | Test fixtures: openly licensed grave photos from Commons (e.g. `WashingtonIrvingGrave.jpg` from the Sleepy Hollow snapshot), license recorded next to each. Swap in Ben's sample stone when he provides it | `tests/fixtures/stones/LICENSES.md` | ⬜ |
| L3.7 | P1 | Live camera viewfinder with a stone-shaped guide (getUserMedia) | — | ⬜ |
| L3.8 | P2 | Automatic corner detection | — | ⬜ |

### Lane 4 — Spirit box + games ✅ merged 10/20 02:40 UTC (P0s + L4.4). `?test-caps=` only shortens sessions and shows a banner; left on in prod for e2e
Owns: `lib/spirit/**`, `lib/games/**`, `app/spirit/**`, `app/games/**`, `components/spirit/**`, `components/games/**`, `tests/e2e/spirit-games.spec.ts`.

| ID | Tier | Item | Acceptance | Status |
|---|---|---|---|---|
| L4.1 | P0 | Spirit box: Web Audio white noise → band-pass filter stepping every 50–350 ms (slider), click gaps, faint carrier blips. Low-pitch `speechSynthesis` fragments from a word bank of **only** `spiritEligible` burials at the chosen cemetery (first names, surnames, occupations, death years spoken as "eighteen ninety"). On-screen captions log every "voice". Caps: 10 minutes and 60 utterances per session. Disclaimer played straight: "The spirits use your phone's text-to-speech." Audio and speech start from the tap (iOS). No speech → captions only, and say so | vitest: word bank excludes people dead < 75 years; Playwright: caps stop the session | ✅ local prod, merged 10/20 02:40 UTC; orchestrator re-ran `tests/e2e/spirit-games.spec.ts` 16/16 on the merged build and watched captions run; word bank built through `spiritEligible`. Real phone audio/speech: pending |
| L4.2 | P0 | Tombstone Bingo: 5×5 of carved symbols with their traditional meanings (lamb, weeping willow, draped urn, broken column, clasped hands, winged hourglass, inverted torch, anchor, square and compass, three chain links, Woodmen of the World tree stump, GAR star, white-bronze zinc marker…), center "R.I.P.", seeded per player | vitest: same seed → same card; different seeds → different cards | ✅ local prod: 44 symbols with meanings, seeded cards, unit + e2e |
| L4.3 | P0 | Graveyard party, stateless: "Start a party" makes a link with a seed; everyone who opens it gets the same bingo card | Gate 7 via two Playwright contexts | ✅ local prod: two-context e2e, second phone has the identical card in ~200 ms (Gate 7 locally) |
| L4.4 | P1 | EVP recorder: 15 s from the mic, played back reversed and slowed; hidden without a mic | — | ✅ local prod: fake-mic e2e, playback is the exact reverse at 0.7×; hidden without getUserMedia |
| L4.5 | P1 | Epitaph Hunt checklist; Who Am I? (three clues from a tour); Stone Math tool (uses `lib/stonemath` once Lane 3 merges) | — | ⬜ |

### Lane 7 — Gravitator (Ben's ask, P1) 🟨 builder dispatched 10/20 02:55 UTC
Owns: `app/gravitator/**`, `app/api/gravitator/**`, `components/gravitator/**`, `lib/gravitator/**`, `tests/e2e/gravitator.spec.ts`.

| ID | Tier | Item | Acceptance | Status |
|---|---|---|---|---|
| L7.1 | P1 | Deck API: one profile SPARQL + one burials SPARQL + batched extracts, public filter, cached per rounded point | unit tests on fixtures; live timing reported | ⬜ |
| L7.2 | P1 | Swipe deck UI: drag, buttons, keyboard, reduced motion, match screen, saved list | `tests/e2e/gravitator.spec.ts` | ⬜ |
| L7.3 | P1 | Palette contrast ≥ 4.5:1 for every text pair, both themes | unit test | ⬜ |

Coverage note (verified 10/20): within 8 km of downtown Atlanta, 20 cemeteries; 3 have a founding date, 1 an area, 2 a photo, 1 a heritage listing. Sparse cards must look intentional.

### Lane 8 — Haunted Calendar (P1) 🟨 builder dispatched 10/20 03:00 UTC
Owns: `app/calendar/**`, `app/api/calendar/**`, `components/calendar/**`, `lib/calendar/**`, `tests/e2e/calendar.spec.ts`. Feed `GET /api/calendar/[qid]` (RFC 5545, yearly all-day events, stable UIDs, 25-year respect rule, day-precision dates only); page `/calendar` with Apple/Google/Outlook subscribe links. Bundled snapshots now; orchestrator swaps in Lane 2's live loader on merge. Real subscriptions need the public prod URL (preview is SSO-protected).

### Lane 9 — Séance mode (P1) 🟨 builder dispatched 10/20 03:00 UTC
Owns (taking over from finished Lane 4): `lib/spirit/**`, `app/spirit/**`, `components/spirit/**`, `app/games/party/**`, `app/api/time/**`, `tests/e2e/seance.spec.ts`, `tests/e2e/spirit-games.spec.ts`. Deterministic slot schedule from hash(room, cemetery, slot); bank hash in the link; 10 s aligned start with countdown; existing caps and respect rules unchanged.

### Lane 5 — The viral lifecycle (starts only after the Lane 2+3 stranger pass)
| ID | Tier | Item | Status |
|---|---|---|---|
| L5.1 | P1 | `/c/[slug]` cemetery pages ("Famous graves at Lake View Cemetery") with JSON-LD `Cemetery` + `Person`; sitemap carries the top cemeteries | ⬜ |
| L5.2 | P1 | Share: stamp, kit sheet, spirit box transcript card, tour recap. `/s/[signed payload]` pages with dynamic OG images (`next/og`; no `runtime` export: Next 16 rejects it with Cache Components, Node is the default), 1200×630 and 1080×1920. Web Share with files; fallback copy link + save image. One call to action per landing page | ⬜ |
| L5.3 | P1 | Passport `/p` kept on the phone: stamps made, cemeteries visited, badges (oldest stone found, a Civil War veteran, 100+ years gone) | ⬜ |
| L5.4 | P1 | Measure with Vercel Analytics custom events: `share_created`, `share_viewed`, `tour_started_from_share`, `party_created`, `party_joined` | ⬜ |
| L5.5 | P1 | Guardrails: nothing unlocks only by sharing, no push notifications, no contact access, report button on every public page, a takedown path for families, respectful share cards for recent deaths | ⬜ |
| L5.6 | P2 | Realtime party log, server passport, `/admin` funnel (all need a database) | ⬜ |

### Lane 6 — Demo pack (from Fri 16:30 UTC / 12:30 PM EDT, plus the shoot)
| ID | Item | Status |
|---|---|---|
| L6.1 | Stranger pass on prod by someone who has never used it; record what they couldn't do; fix the P0s | ⬜ |
| L6.2 | Video script (~2–3 min): the problem → at Oakland: nearest cemetery → a story card → stamp a stone → 10 s of spirit box → the party link opening on a second phone → what's next. Lead with the spirit box speaking real names of people buried there: that's the "haunted" line voters weigh | ⬜ |
| L6.3 | Shoot at Oakland Cemetery (check its hours and photo/filming policy first). Backup: screen recording of the full flow with the offline Oakland snapshot | ⬜ |
| L6.4 | Submission: README section on what was built during the event, prior-work line (done), data sources and licenses; writeup ≤ 500 chars; model declaration (Ben's wording); screenshot; optional receipt = this Claude Code session link | ⬜ |

---

## Ben's clicks

| # | Click | Status |
|---|---|---|
| 1 | Fill the blanks | ✅ deadline 10/23; domain on hold; prior-work rule = Hackyard rules page; repo given |
| 2 | Repo | ✅ exists; `main` created 10/20 with Ben's OK |
| 3 | Supabase project | ✅ declined 10/20 → stateless (decision 1a) |
| 4 | Vercel CLI login | ✅ 10/20 |
| 5 | Dedicated Anthropic API key with a workspace spend limit → paste into Vercel env as `ANTHROPIC_API_KEY` | ✅ 10/20: Production + Preview |
| 6 | Every production deploy (`vercel --prod` or Promote in the dashboard) | ⬜ |
| 7 | Domain purchase | ⏸ on hold |
| 8 | A stranger for the stranger pass; filming at Oakland | ⬜ |
| 9 | Any outreach or launch post (drafted, not sent) | ⬜ |
