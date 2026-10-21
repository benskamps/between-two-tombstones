> Copied from the reviewer's scratch folder. The screenshot and log paths below are on the build machine and are not in the repo. Reviewed against the PR preview at c8b32fe (app code as 45a94aa).

# UI/UX review, pass 4: the last check before PR #2 merges to production

**Build tested.** The preview at PR head `dd60aef`, whose app code is the same as `45a94aa`. It is read-only, checked Wed 10/21 ~05:45–06:20 UTC. I confirmed the preview serves the new build: the hub's "I found it" is a ghost pill (transparent fill, fully rounded), and `/near` shows an arched "Best stories nearby" card.

**Method.** Same as passes 1–3: Playwright on a Pixel 7 profile; 27 screen states; axe accessibility checks; 13 transitions at 4× CPU; a Gate 2 timing walk; and faked outages for the spirit box and the Gravitator.

**Evidence.** Everything below sits under `/tmp/claude-0/-workspace/f26bab00-5fce-5043-a740-d147e6d890dc/scratchpad/ux-review/`:
- screenshots: `shots4/*.png`, plus `shots2/g4-*.png` for the Gate 2 walk
- logs: `p4-screens.log`, `p4-transitions.log`, `p4-gate2.log`, `p4-gate2b.log`

The share token is in no file.

## Verdict: **SHIP**

There are no P0s for the merge.

Every REVIEW-3 top-10 item has landed. The core path has no regressions:
- **Accessibility:** axe finds 0 violations on every audited screen.
- **Layout shift:** 0.000 on all 13 transitions.
- **Header and titles:** the header is 57 px everywhere, and every page title sits at y=73.
- **Scroll on Back:** restored (2,392 → 2,392).
- **Gate 2, warm:** Oakland shows 5 stories 3.2 s after the tap.

One Gate 2 risk is not a merge blocker: a large cemetery that nobody has loaded yet takes 22–27 s (item 1 below). Production today is worse on the same path. In pass 2 the old query failed outright on Mount Auburn, so merging improves it.

---

## 1. REVIEW-3 top 10

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | One sign per tool | ✅ | `components/ui/tools.tsx` `TOOL_ICON`. Nav, hub toolkit, games hub and page titles all match: Stamp fern, Spirit planchette, Séance candle, Bingo hourglass, Party key, EVP waveform, Calendar poppy (`hub-toolkit.png`, `games.png`, `bingo-tapped.png`) |
| 2 | Hub buttons | ✅ | "I found it" is a ghost pill; walk, download and more-stops are pills. **1 filled button on the hub** (the mode chip), down from 13 (`hub-toolkit.png`, `card-plain.png`) |
| 3 | One header | ✅ | 57 px on every screen and transition; the wordmark is the same size with or without the badge (`grav-deck.png` vs `hub-top.png`) |
| 4 | Colour roles | ✅ | All four Stamp steps are candle darkroom easels with a candle readout strip (`stamp-specimens.png`). Bingo found squares and "FOUND" are lichen. "Haunting:" is no longer lichen |
| 5 | One room code | ✅ | The split-flap code is on the séance invite, the séance room and the party (`seance-invite.png`, `seance-running.png`, `party-link-nohaunt.png`). I didn't re-measure the two join fields |
| 6 | One title tier | ✅ | `/near`, `/search` and not-found use PageHeader with a pair; every h1 sits at 73 (the Gravitator too). "Best stories nearby" is an arch (`near-chs.png`, `fail-notfound.png`) |
| 7 | One readout shape | ✅ | Spirit, séance, EVP and Stamp strips are all **37 px, one line** (`p4-screens.log`) |
| 8 | One primary | ✅ | Spirit 1, party 1, home with a fresh haunt: "Back to it", with "I'm here" as a ghost (`home-fresh.png`) |
| 9 | ToolTile | ✅ | The games hub rows and the hub chips share the medallion |
| 10 | Bingo legibility | ✅ | 13 px labels and 30 px glyphs; readable at video scale (`bingo-tapped.png`) |

Pass-2 F27 is also done: "Unusual death" is now "Notable death". Plain story cards use `.card.card-plain` (17.6 px radius) with 0 ornaments (Maynard Jackson, `card-plain.png`).

**The polish builder's judgement calls:**

| Call | My view |
|---|---|
| EVP waveform, not the moth | **Agree.** It reads as a recorder, and the moth stays the Gravitator's |
| Story-card glyph pairs reuse tool signs as "epitaph art" | **Mild disagree, P2, after the merge.** The default pair, ringed moon + lily, is literally Haunt + Saved and sits on most cards. Joseph Brown's hourglass sits directly under the Bingo hourglass chip (`hub-toolkit.png`). The bingo set already has real epitaph glyphs (willow, urn, lamb, broken column, laurel); use those for the apex. Not a blocker |
| No pair on the Gravitator title | **Agree.** The "Your graveyards" pill is the right thing in that slot |
| After starting a séance, "Start" and "Open the séance" are both filled | **Agree.** "Start" is in the panel above and off-screen when the invite shows, so only one primary is in view (`seance-invite.png`) |

## 2. Regressions on the core path

| Path | Result |
|---|---|
| Home → "I'm here" → Oakland opens directly | ✅ The tap lands before hydration; hub at +2.9 s |
| Hub → Stamp → Spirit → Games → Bingo → Back → Haunt → Calendar → Back → EVP → logo → "Back to it" → Spirit | ✅ Commit 45–110 ms, quiet in 0.7–1.0 s, no layout shift, scroll restored |
| Charleston `/near` | ✅ Magnolia is pinned in an arch with "Open the tour"; the empty churchyards are folded away |
| Search "oakland" | ✅ 20 results, Atlanta first |
| Arlington (Q216344) | ✅ Settled in 5.2 s with 12 stories (probably warmed by earlier tests; see item 1 for the truly uncached case) |
| Plain card | ✅ No ornament, on the shared radius |
| Gate page (`/stamp` with no haunt) | ✅ Copy names the tool; the doors follow |
| Party link with no haunt | ✅ Opens straight into the card with a split-flap ROOM; no gate |
| Séance link with no haunt | ✅ Opens and joins |
| Outage: Gravitator deck API down | ✅ "Couldn't reach Wikidata. Your saved graveyards still open while you wait.", with Try again and Your graveyards |
| Outage: spirit box names API down | 🟨 Works, but the copy needs a fix (item 3) |
| Not found | ✅ Skinned, with one primary pill |

## 3. Gate 2 on the preview (machine time, tap → 5 stories)

| Run | Path | Result |
|---|---|---|
| Oakland, slow 4G | Opens the tour directly | **3.2 s** ✅ |
| Mount Hope, Rochester (214 people), 3G, uncached | Opens the tour directly | **6.0 s** ✅ |
| Green-Wood, Brooklyn (1,856 people), 3G | Opens the tour directly | **13.4 s** ✅ |
| Bellefontaine, St. Louis (417 people), 3G, uncached | Pinned card → tap | **26.5 s** ❌ About 22 s of it on a static "Gathering the stories…" (`shots2/g4-cold-bellefontaine-3g-wait12s.png`) |
| Spring Grove, Cincinnati (474 people), 3G, uncached | Opens the tour directly | **32.6 s** ❌ About 27 s on the loading screen |

The wait is on the server. The `/near` step takes under 3 s even on 3G.

---

## Top 5 other items (none block the merge)

| # | Sev | Item | Small fix |
|---|---|---|---|
| 1 | **P1, Gate 2 risk** | A large uncached cemetery (400+ people) can take 22–27 s on a static loading screen. Its copy says "This takes a few seconds the first time". A stranger at Bellefontaine or Spring Grove would miss the 20 s gate. | (a) Show the first stories as soon as the first batch of 20 Wikipedia summaries lands, instead of waiting for all 80. (b) After 8 s, add a line: "This is a big cemetery; the first load can take half a minute." (c) If the stranger pass is at a large cemetery, re-time that spot first |
| 2 | P2 | The story card's death/life pair reuses tool signs (the judgement call above). | Use the bingo epitaph glyphs (`components/tour/StoryCard.tsx:30-36`) |
| 3 | P2 | When a link carries a cemetery that isn't a sample and its names fail to load, the spirit-box picker says "The cemetery from your last tour / Q216344". It shows an ID, ignores `name=`, and the cemetery came from a link, not a tour. The error reads "…Wikidata: Couldn't reach Wikidata.. Pick a sample…" (duplicated prefix, double period) (`fail-spirit-names-down.png`). | Use `name=` for the label, say "From your link", and drop the source prefix and the extra period |
| 4 | P2 | The "Make this my haunt" strip on a non-haunt hub wraps "Your haunt is Oakland Cemetery." to 3 lines beside the pill (`arlington.png`). | Stack the pill under the sentence below 420 px |
| 5 | P2 | `/near` still shows 1-person cemeteries as full cards (Bethany, Friendly Union), each opening a 1-card tour (`near-chs.png`). | Fold anything under 5 people into the "no one listed" details row, or label the count plainly |
