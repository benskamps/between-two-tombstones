> Copied from the reviewer's scratch folder. The screenshot and log paths below are on the build machine and are not in the repo. Reviewed against the PR preview at 31fe753.

# UI/UX review, pass 3 (L10.9): cohesion and smoothness

**Scope:** the preview at `31fe753`, read-only, Wed 10/21 ~04:40–05:20 UTC. Findings go to the design-system polish lane.

**Method:**
- **Device:** Playwright, Pixel 7 (412×839, DPR 2.625).
- **Screens:** I walked 27 states. Each one I screenshotted and measured: header height, h1 position, size and font, filled buttons, panel radius, border and colour, readout-strip geometry, Michroma usage, IM Fell digits, ornament counts, and axe.
- **Transitions:** 13 steps (home → near → hub → each tool and back) at 4× CPU, with CDP screencast frames, layout-shift sources and running animations.

**Evidence, relative to `/tmp/claude-0/-workspace/f26bab00-5fce-5043-a740-d147e6d890dc/scratchpad/ux-review/`:**

| What | Where |
|---|---|
| Screens | `shots3/*.png` |
| Transition frames | `frames3b/NN/*.jpg`, with contact sheets in `shots3/contact-*.jpg` |
| Measurements | `p3-screens.log`, `p3-transitions.log` |
| Scripts | `p3/*.mjs` (the share token comes from the environment and is never written) |

Code references are file:line at `31fe753`.

---

## Verdict

**Smooth: yes.** Across all 13 transitions:
- **No layout shift:** CLS 0.000 on every step.
- **Stable frame:** the header stays 57 px, every tool's h1 lands at y=73, and Back restores the scroll position (hub at 2,947 px → calendar → back → 2,947).
- **Speed:** a tool switch commits in 50–120 ms and is quiet in 0.7–1.1 s.
- **Feedback:** the early tap shows "Finding you…" before hydration.
- **Motion:** no two animations ever run at once.

The remaining smoothness issue is one header resize (#3 below).

**Cohesive: not yet.** The skins are good one by one; the doors, the arch story card, the spirit and EVP instruments, the bingo stones and the almanac are each strong. But they don't share a grammar yet:
- **Icons:** the same tool wears up to three different icons, and three icons each mean two or more different things.
- **Accent colours:** each builder picked its own accent per screen. Stamp Kit runs candle, mauve and wisp frames on one page.
- **Untouched surfaces:** the hub's buttons, /near, /search, the failure pages and the Gravitator still use pre-skin styles.

Most fixes below are a class or a token change, not a redesign.

---

## Ranked cohesion fixes

Severity: **P1** = visible in the demo or on every visit; **P2** = polish.

| # | Sev | Finding (concrete pair) | Evidence | Small fix | Files |
|---|---|---|---|---|---|
| 1 | P1 | **One tool, one icon.** See the collision table below this one. | `components/shell/BottomNav.tsx:14-25`; `components/haunt/HauntToolkit.tsx:18-24`; `app/*/page.tsx` PageHeader `death=` props; `app/games/page.tsx`; `shots3/hub-toolkit.png`, `shots3/games-full.png` | Add one `TOOL_ICON` map in `components/ui/` (e.g. Haunt RingedMoon, Stamp Fern, Spirit Planchette, Séance Candle, Bingo HourglassSprout, Party Key, EVP Moth, Calendar Poppy). Nav, toolkit, games hub and the PageHeader **death** sign all read it; only the life sign varies per page. The logo keeps RingedMoon, which then also means Haunt | `components/ui/symbols.tsx` (+ map), `BottomNav.tsx`, `HauntToolkit.tsx`, `app/games/page.tsx`, `app/{stamp,spirit,games,games/*,calendar}/page.tsx` |
| 2 | P1 | **The hub still uses pre-skin buttons, and 13 of them are primaries.** Every story card has a filled-mauve **rounded-rect** "I found it" (8 px radius; every other button in the app is a pill). The axe pass counted 13 filled mauve buttons on the hub's first 12 stops, against one per screen everywhere else. "Start the walk", "Download this tour" and "Show 12 more stops" are 12 px rects; the Stamp Kit's equivalent "Use a different photo" is a pill. | `components/tour/FoundItButton.tsx:72,85`; `components/offline/DownloadTourButton.tsx:55`; `components/tour/TourView.tsx` (walk button, more-stops); `shots3/card-old-2.png`, `shots3/contact-07.jpg` | "I found it" becomes `btn btn-ghost` with a pin glyph. Once pinned: lichen text "Found · ±8 m" and a ghost "Remove pin". Walk, Download and More become `btn btn-ghost` pills. The only filled control on the hub is the selected mode chip | as listed |
| 3 | P1 | **The header changes between screens.** The wordmark drops from 20 px to 16 px whenever "Haunting:" shows. You see it on the first "I'm here. Haunt me." (the last frame of `contact-01.jpg`) and on every Gravitator ↔ tool move (no badge on the Gravitator, badge on tools). It is the only element that moves in the whole walk. | `app/globals.css:155-158`; `components/shell/SiteHeader.tsx:16`; `shots3/home-none.png` vs `shots3/hub-top.png` | Set the wordmark to one size (16–17 px) in every state; the badge only fills the right slot | `globals.css`, `SiteHeader.tsx` |
| 4 | P1 | **Accent colours per builder, not per meaning.** See the accent-roles note below this table. | `components/stamp/StampKit.tsx:272,340` (easel) vs `:361,447,543` (`card`); `:366` (wisp strip); `components/calendar/CalendarSubscribe.tsx:311`; `components/games/games.css` (bingo heading); `shots3/stamp-after-full.png`, `shots3/calendar-full.png` | Write down accent roles in `globals.css`. Then: Stamp steps 3, 4 and "Can't make out the words?" get `darkroom-easel bezel`, so all five Stamp panels match. Add a `.readout-strip[data-tone="candle"]` variant for Stamp and the almanac. Bingo's "YOUR CARD / FOUND" becomes muted (or the board becomes an instrument) | `globals.css`, `StampKit.tsx`, `CalendarSubscribe.tsx`, `BingoGame.tsx` |
| 5 | P1 | **Two room codes.** The party shows a split-flap `RoomCode` (wisp cells in a mini instrument). The séance invite shows `font-mono text-4xl font-bold tracking-[0.3em]` bone letters. Their join fields differ too: the séance field is `font-mono uppercase tracking-widest` with an uppercase mono placeholder ("E.G. KXMPRT"); the party field is `font-bold uppercase tracking-[0.2em]` with a normal placeholder ("e.g. KXMPRT"). | `components/spirit/SeanceInvite.tsx:47`; `components/games/RoomCode.tsx:7`; `components/spirit/SeanceStart.tsx:106`; `components/games/PartyLobby.tsx:86`; `shots3/seance-invite.png`, `shots3/party-started.png`, `shots3/spirit-idle-full.png` | Promote `RoomCode` (already planned) and use it in `SeanceInvite` and at the top of the séance room. Add one `RoomCodeField` (Atkinson bold uppercase, tracked, normal-case placeholder) for both join forms | as listed + `components/ui/` |
| 6 | P1 | **Two page-title tiers, and the old app's pages are bare.** See the title and ornament note below this table. | `app/near/page.tsx`, `app/search/page.tsx`, `app/cemetery/[qid]/page.tsx` (not-found), `components/offline/SavedTourPage.tsx` (`text-3xl` h1s); `components/gravitator/Gravitator.tsx:68-69`; `shots3/near-list.png`, `shots3/fail-notfound.png` | /near, /search, not-found and saved tours use `PageHeader` (near/search: Gate + Sprout; failures: hourglass + sprout). The "Best stories nearby" card becomes an `ArchFrame` with the stop-card's apex pair, so near → hub continues the arch. The not-found link becomes a primary pill. Gravitator: `leading-tight` on the h1 and centre the "Your graveyards" pill on the h1 row, so the h1 sits at 73 | as listed |
| 7 | P1 | **Readout strips: one component, four shapes.** Heights: spirit 86 px (3 lines), séance room 111 px (4), Stamp 62 px (2), EVP 38 px (1). Order differs: spirit puts the status last ("…SWEEP 150 MS / STANDBY"); EVP puts it second ("EVP STANDBY 0:15"). The 3–4-line strip pushes the spoken word down on the two video screens. | `components/ui/Instrument.tsx:21`; `SpiritBox.tsx:259`; `SeanceBox.tsx:259`; `EvpRecorder.tsx:404`; `StampKit.tsx:366`; `p3-screens.log` (strips) | Fix the contract: lamp · STATUS · at most 3 values, one line at 412 px (`flex-wrap: nowrap; overflow: hidden`). Drop "AT OAKLAND CEMETERY" (it's in the picker and header) and "ROOM X" (RoomCode carries it) | as listed |
| 8 | P1 | **One primary per screen, three exceptions.** Spirit idle: "Start" and "Start a séance" are both mauve. Party: "Start a party" and "Start a séance". Home with a fresh haunt: "Back to it" and "I'm here. Haunt me." on the first screen. Single-primary screens for comparison: Stamp, EVP, calendar (Google only), séance invite. | `p3-screens.log` (filled lists); `components/spirit/SeanceStart.tsx:48`; `components/haunt/HauntReturn.tsx` | A section that isn't the page's job gets `btn-ghost`: "Start a séance" on /spirit and /games/party; "I'm here. Haunt me." while a fresh haunt is shown (keep "Back to it" primary) | as listed |
| 9 | P2 | **The same tools in three list designs.** Hub toolkit: 12 px `surface-2` chips with mauve icons. Games hub: `.card` rows with a wisp-ring medallion and a description. Home doors: arches. The same four tools (Bingo, Party, Séance, EVP) look and are drawn differently on the hub and on /games. | `HauntToolkit.tsx:79-90`; `app/games/page.tsx` (`games-medallion`); `shots3/hub-toolkit.png` vs `shots3/games-full.png` | One `ToolTile` primitive: the wisp-ring medallion and title, in a `chip` variant (hub) and a `row` variant with a description (/games). Icons come from #1 | `components/ui/`, both callers |
| 10 | P2 | **Heading tiers inside tools drift.** The same cemetery radio picker is titled "Whose names" (IM Fell h2, spirit) and "Cemetery" (Atkinson bold label, calendar). Group headings are IM Fell 24 on spirit, party, Stamp and EVP, but Atkinson bold on /near ("Best stories nearby", "Also nearby") and the hub ("Your haunt"). | `shots3/spirit-idle-full.png` vs `shots3/calendar.png`; `shots3/near-list.png` | Tiers: section h2 = IM Fell 24; field or group label = Atkinson bold 17; Michroma only for redundant labels and readouts (wisp inside `.instrument`, muted outside). Rename the calendar's picker to the spirit's wording, or the reverse | `CalendarSubscribe.tsx`, `app/near/NearList.tsx`, `HauntToolkit.tsx` |
| 11 | P2 | **The specimen windows letterbox.** `.specimen-window { aspect-ratio: 1 }` on a black ground gives the portrait rubbing and postage stamp black side bars, while the ink stamp sits edge to edge on paper. This is the Stamp Kit video moment. | `components/stamp/darkroom.css:116-131`; `shots3/stamp-specimens.png` | Use `aspect-ratio: 4 / 5` (the render's ratio) with the paper ground for all three; after rendering, show the three in the compact tray, side by side | `darkroom.css`, `StampPreviews.tsx` |
| 12 | P2 | **Failure, empty and loading states speak four dialects.** See the loading-states note below this table. | `shots3/fail-notfound.png`, `shots3/gate-stamp.png`; `frames3b/07`, `frames3b/08`, `frames3b/13` | Add one `EmptyState` (a `.card`, one glyph, an IM Fell title, one Atkinson line, one primary pill) and one loading pattern: the panel's own skeleton plus one muted line; "LOADING/STANDBY" readouts only inside instruments. On the gate, drop the PageHeader pair (the hourglass is enough) | `components/ui/`, callers |
| 13 | P2 | **Gravitator edges and radii.** `g-btn-ghost` uses the decorative border (#43364B, 1.56:1), so "Your graveyards" and "Remove" are fainter than every other ghost pill (ash, 1.5 px; Pass already uses ash). Cards use 24 px radii where the rest of the app uses 17.6 px, and the intro art mixes filled silhouettes with line-art symbols. | `app/gravitator/gravitator.css:70-74`; `shots3/grav-intro.png`, `shots3/grav-saved.png` | Alias `.g-btn-ghost` to `--edge` at 1.5 px; set `.g-card` radius from a shared `--radius-card`; redraw the tree and headstone as 1.5-stroke line art, or leave the art and accept it. Deck mechanics stay as they are (Ben) | `gravitator.css`, `PlaceholderArt.tsx` |
| 14 | P2 | **Stand-in files are still live.** Six pages import `components/ui/games/PageHeader.tsx` (a copy of `Motifs.tsx:66`); `components/ui/games/skin-b-instrument.css` still loads. They are identical today, so this is drift risk rather than a visible bug. | `git grep PageHeader` (calendar, bingo, evp, games, party, stamp) | Switch the imports to `@/components/ui/Motifs` and delete both stand-ins (the polish lane's plan) | as listed |
| 15 | P2 | **The plain card's radius differs.** The plain card for recent deaths is `rounded-xl` (12 px); every other `.card` is 17.6 px. It stays plain (0 ornaments, correct); only the radius is off the system. | `components/tour/StoryCard.tsx` (plain className); `shots3/card-plain.png` | Use `.card` without `::before` (add a `card-plain` modifier) | `StoryCard.tsx`, `globals.css` |

**#1 detail: icon collisions** (one icon, several meanings):

| Icon | Meanings today |
|---|---|
| RingedMoon | Logo; Haunt tab; toolkit "Spirit"; Calendar title |
| Planchette | Spirit tab; toolkit "Séance" |
| Comet | Games tab; toolkit "Bingo"; EVP title |
| Moth | Gravitator tab; toolkit "EVP"; Games title; calendar rows |

The same tool, drawn differently:

| Tool | Toolkit | Games hub | Page title |
|---|---|---|---|
| Bingo | Comet | Willow | Candle |
| EVP | Moth | Waveform | Comet |

**#4 detail: accent roles.** Today:
- **Stamp Kit:** steps 1–2 are candle "darkroom easels" with candle bezel ticks. Steps 3–4 and "Can't make out the words?" are plain mauve-ruled `.card`s. Step 3 holds a wisp phosphor strip. Three frame languages on one page.
- **Calendar:** mauve radio cards, a candle almanac and a wisp readout ("30 DEATH-DAYS A YEAR").
- **Bingo:** the wisp Michroma "YOUR CARD" sits on a stone board, not an instrument.

The proposed roles:
- **Mauve:** you can act on it.
- **Candle:** light and warmth (safelight, candle, dates, R.I.P.).
- **Wisp:** a live instrument reading, only inside `.instrument`.
- **Lichen:** alive, found or kept.

**#6 detail: titles and ornament.**
- **Two h1 tiers:** 30 px (`text-3xl`) on home, /near, /search, not-found and saved tours; 36 px with a death/life pair on the hub, every tool and the Gravitator.
- **Gravitator offset:** its h1 sits at y=79; every other page's is at y=73.
- **Ornament gap:** decorative SVG count is 0 on /near, /search, the Gravitator and failures, against 5 on home and 31 on the hub. So the first walk goes rich → bare → rich.

**#12 detail: loading and empty states.**
- **Loading lines:** the hub says "Gathering the stories…" (an IM Fell h1). Spirit says "Loading the names…" (a muted line in a card). Calendar says "LOADING" (a Michroma wisp readout plus a sentence). The gate shows a disabled "Loading…" pill.
- **Not-found:** bare text, a 30 px h1, an underlined link and no frame.
- **The gate:** three symbol pairs on one screen (PageHeader, hourglass, door).

---

## Smooth? (transitions, `p3-transitions.log`)

| Step | Commit | Quiet | CLS | Header | Notes |
|---|---|---|---|---|---|
| Home → "I'm here. Haunt me." → hub | 535 ms | 1.7 s | 0 | 57→57 | Nav swaps 3→4 tabs (by design). **Wordmark shrinks** (#3) |
| Hub → Stamp → Spirit → Games → Bingo → Back | 4–121 ms | 0.7–0.9 s | 0 | 57 | h1 at 73 on every page. The spirit names arrive inside a reserved card (no shift) |
| Hub (scrolled 2,947) → Calendar → Back | 68 / 4 ms | 0.9 / 0.8 s | 0 | 57 | **Scroll restored to 2,947** |
| Hub → EVP → logo → home → "Back to it" → hub | 54–95 ms | 0.7–1.1 s | 0 | 57 | — |

**Motion:**
- One running animation at a time: `btt-flicker` ×3 on home and bingo.
- Nothing runs on hub or tool pages at rest.
- The spirit box needle runs only while the box is live.

**Loading states differ between tools** (see #12 above): the user sees four styles of "wait" in one walk.

---

## Life and death in balance?

| Screen | Leans | Why | Move |
|---|---|---|---|
| Home doors, carved story card, bingo | Balanced | Death/life pair on each arch; found bingo stones get a lichen sprout | Keep |
| Spirit, séance, EVP | Death | Instrument glass, wisp, ghosts; life only in "Turn it off near mourners." | Put the life sign at the panel foot (a lichen sprout before "Turn it off near mourners.") and keep the lamp wisp |
| Calendar | Death | A moth on every row; birthdays (the life half) hidden behind a plain checkbox | Make "Add birthdays too" a lichen-edged toggle with a sprout; birthday rows get a lichen sprout instead of the moth |
| Gravitator | Life | Dating, a heart, a candle "Go now"; no death sign at all | Add a PageHeader pair (moth + candle, the door's own pair) |
| /near, /search, failures | Neither | No ornament (#6) | PageHeader pairs |
| Hub "I found it" | — | A mauve action, no life signal once pinned | Pinned = lichen "Found" (#2): finding a grave becomes the app's clearest "life" moment |

**Rule worth writing down:** lichen means found, kept or alive (bingo found, grave pinned, birthday, saved graveyard). Today lichen is used for the "Haunting:" label and "Your haunt" titles, which are neither.

---

## The six video moments

| Moment | Strongest screen? | Single change that lifts it |
|---|---|---|
| Doors (`shots3/home-none.png`) | Yes. Both doors and nav fit in one frame | Enlarge the door symbol pairs from 20 to 28 px; at phone-recording scale they read as specks |
| Hub card (`shots3/card-old-1.png`) | Yes, the arch and carved name read well | Clamp the lead paragraph to about 4 lines ("Read more"), so the portrait and the Find a Grave row land inside the card's first screen; today the portrait is 700 px down. With #2, "I found it" stops competing with the name |
| Stamp specimens (`shots3/stamp-specimens.png`) | Almost | #11: no letterbox bars, and the three specimens side by side in one frame after rendering |
| Spirit box (`shots3/spirit-running.png`) | Yes. The glowing IM Fell word is the best frame in the app | #7: a one-line readout strip, so the word and needle sit mid-panel |
| Séance on two phones (`shots3/seance-running.png`) | Good, but two phones side by side don't show they match until a word lands | #5: the big split-flap RoomCode at the top of each phone's séance panel, so the code matches before the word lands |
| Bingo (`shots3/bingo-tapped.png`) | Yes. Arched stones, wisp glow and sprout on found | Raise labels from 11 px to 13 px (`components/games/games.css:44`) and glyphs from 26 to 30 px; at video scale, labels under 12 px blur |

---

## Regressions since pass 2

| Check | Result |
|---|---|
| a11y | ✅ axe 0 violations on all 20 audited screens (home, near, search, hub, Stamp idle and after, spirit, séance room, games, bingo, party, EVP, calendar, Gravitator ×3, gate) |
| Contrast | ✅ Sunlight swaps are in (mauve `#D6BAE6`, lichen `#C3DBB6`, danger `#FFB3AA`) |
| Tap targets | ✅ No interactive control under 44 px (only text labels flagged) |
| IM Fell numerals | ✅ None on any screen (scripted): calendar day numerals, Stamp steps and the séance countdown are Atkinson |
| Plain cards | ✅ 0 ornaments inside `[data-style=plain]`; Maynard Jackson is plain |
| Nav and fonts | ✅ Nav labels are one word, Michroma 13 px |
| ⚠️ Bingo labels | Now **11 px** (`games.css:44`). Readability outdoors and on video; see the bingo row above |
| ⚠️ Stand-ins | The stand-in files (#14) |

No other regressions found.
