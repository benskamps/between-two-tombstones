# Demo pack (draft)

Hackyard Yard #5 wants: public repo, a writeup of 500 characters or less, a model declaration, a demo video (required this Yard) and a screenshot. Voters weigh theme fit ("it creeps into something real") and whether it actually works. Most won't install anything, so the video carries the vote.

## Writeup (497 characters)

> Between Two Tombstones is a graveyard companion that works on real cemeteries. Pick one near you: it finds the graves with the best stories (Wikidata and Wikipedia), walks you through them, and keeps working without signal. Photograph a headstone to get a rubbing, an ink stamp and a postage stamp, or let Claude read the worn carving. The spirit box speaks the names of people buried right there, in sync across your friends' phones. Subscribe, and your calendar gets their death-days every year.

Model declaration: Ben's wording. (Built with Claude Code; the app calls Claude for reading headstones.)

A newer draft (484 characters, mentions share links) is in `README.md` under "Writeup", marked for Ben to approve.

## Before the shoot

- [ ] Production is live (Ben's deploy click) and the stranger pass is done.
- [ ] Oakland Cemetery: check today's gate hours and its photography and filming rules. Personal phone video is usually fine; ask at the visitor center if unsure.
- [ ] Screen brightness up on every phone, auto-brightness off (the app is dark only; outdoor glare). Volume up.
- [ ] Film the phone screens as on-device screen recordings (iOS: Control Center → Screen Recording, long-press for mic on) and cut them together with the outdoor footage. A dark screen filmed outdoors goes muddy and mirrors the sky (review F21). If a phone must be on camera, film it in shade.
- [ ] Two or three phones for the séance, each opened from the same link, each tapped Join.
- [ ] "Download this tour" for Oakland on the main phone in case signal drops.
- [ ] Pick a stone for the Stamp Kit yourself: old, legible, in shade. Not anyone who died recently, and not a monument that needs context the video can't give.
- [ ] Don't film other visitors or anyone at a graveside. No rubbings, no leaning on stones.

## Script (about 2½ minutes)

| Time | Shot | What's on screen / said |
|---|---|---|
| 0:00 | Cold open: three phones on a bench near a grave, séance countdown | "The séance begins in 3… 2… 1…", static, then all three whisper the same name at once |
| 0:15 | Title card | "Between Two Tombstones: a graveyard companion that works on real cemeteries" |
| 0:20 | Main phone just inside the gate: "I'm here. Haunt me." | Opens Oakland's tour directly, because you're standing in it (accuracy ±300 m or better). Outside the gate, "Best stories nearby" pins Oakland |
| 0:35 | Tour: Greatest hits | Stop 01 / 80, Margaret Mitchell: the headstone card, dates, age, the story, her portrait, From Wikipedia, Find a Grave link |
| 0:55 | Walk to three graves, tap I found it at each | "Best walking route" appears: the pins you add make the route |
| 1:10 | Stamp Kit at the chosen stone (from the haunt's toolkit) | Darkroom: photo → drag the corners → three specimen cards side by side: rubbing, ink stamp, postage stamp with their age as the value |
| 1:35 | Read with Claude | Transcript with [?] where the carving is worn; it never guesses dates |
| 1:50 | Séance, wider | The same split-flap room code on two phones; both instrument panels speak the same name in the same second |
| 2:05 | Haunted Calendar | Subscribe on the phone, open the calendar app: "Margaret Mitchell died on this day in 1949" → tap → her story card |
| 2:20 | Gravitator, quick | Swipe right on Oakland: "It's a match" |
| 2:30 | Close | Respect rules on screen: spirit box uses only people dead 75+ years; recent deaths get plain cards; etiquette card. "Built in four days with Claude Code. Open source." |

## Backups

- A full screen recording of the flow on the main phone, made before the shoot.
- Offline Oakland and Sleepy Hollow data ship with the app.
- Screenshot for the Hackyard card: the Oakland tour card or the three stamps side by side.

## Still open before the video works end to end (updated 10/22)

- Share links with preview cards (L5.2) are live on prod since PR #4 (decision 24). The iMessage and Slack paste (gate 6) is Ben's.
- Real-phone checks: stamps under 5 s (gate 4), two phones in a party (gate 7), a downloaded tour opened offline (gate 3). Gate 5 (three stones read without invented dates) passed on prod 10/20.
