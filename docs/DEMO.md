# Demo pack (draft)

Hackyard Yard #5 wants: public repo, a writeup of 500 characters or less, a model declaration, a demo video (required this Yard) and a screenshot. Voters weigh theme fit ("it creeps into something real") and whether it actually works. Most won't install anything, so the video carries the vote.

## Writeup (497 characters)

> Between Two Tombstones is a graveyard companion that works on real cemeteries. Pick one near you: it finds the graves with the best stories (Wikidata and Wikipedia), walks you through them, and keeps working without signal. Photograph a headstone to get a rubbing, an ink stamp and a postage stamp, or let Claude read the worn carving. The spirit box speaks the names of people buried right there, in sync across your friends' phones. Subscribe, and your calendar gets their death-days every year.

Model declaration: Ben's wording. (Built with Claude Code; the app calls Claude for reading headstones.)

## Before the shoot

- [ ] Production is live (Ben's deploy click) and the stranger pass is done.
- [ ] Oakland Cemetery: check today's gate hours and its photography and filming rules. Personal phone video is usually fine; ask at the visitor center if unsure.
- [ ] Daylight theme on every phone (outdoor glare). Volume up. Screen recording ready (iOS: Control Center → Screen Recording, long-press for mic on).
- [ ] Two or three phones for the séance, each opened from the same link, each tapped Join.
- [ ] "Download this tour" for Oakland on the main phone in case signal drops.
- [ ] Pick a stone for the Stamp Kit yourself: old, legible, in shade. Not anyone who died recently, and not a monument that needs context the video can't give.
- [ ] Don't film other visitors or anyone at a graveside. No rubbings, no leaning on stones.

## Script (about 2½ minutes)

| Time | Shot | What's on screen / said |
|---|---|---|
| 0:00 | Cold open: three phones on a bench near a grave, séance countdown | "The séance begins in 3… 2… 1…", static, then all three whisper the same name at once |
| 0:15 | Title card | "Between Two Tombstones: a graveyard companion that works on real cemeteries" |
| 0:20 | Main phone at the gate: Find cemeteries near me | Oakland Cemetery, 160 m away, 115 people listed |
| 0:35 | Tour: Greatest hits | Margaret Mitchell's card: dates, age, the story, From Wikipedia, Find a Grave link |
| 0:55 | Walk to three graves, tap I found it at each | "Best walking route" appears: the pins you add make the route |
| 1:10 | Stamp Kit at the chosen stone | Photo → drag the corners → rubbing, ink stamp, postage stamp with their age as the value |
| 1:35 | Read with Claude | Transcript with [?] where the carving is worn; it never guesses dates |
| 1:50 | Séance, wider | Captions on two phones side by side, same words, same second |
| 2:05 | Haunted Calendar | Subscribe on the phone, open the calendar app: "Margaret Mitchell died on this day in 1949" → tap → her story card |
| 2:20 | Gravitator, quick | Swipe right on Oakland: "It's a match" |
| 2:30 | Close | Respect rules on screen: spirit box uses only people dead 75+ years; recent deaths get plain cards; etiquette card. "Built in four days with Claude Code. Open source." |

## Backups

- A full screen recording of the flow on the main phone, made before the shoot.
- Offline Oakland and Sleepy Hollow data ship with the app.
- Screenshot for the Hackyard card: the Oakland tour card or the three stamps side by side.

## Still to build before the video works end to end

- Gate 6 needs share links with preview cards (Lane 5, after the stranger pass).
- Real-phone checks: stamps under 5 s (gate 4), three stones read without invented dates (gate 5), two phones in a party (gate 7).
