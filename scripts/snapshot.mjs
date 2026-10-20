// Pull a cemetery's notable burials live from Wikidata + Wikipedia and write an
// offline snapshot. Facts come only from these sources; nothing is typed by hand.
// Usage: NODE_USE_ENV_PROXY=1 node scripts/snapshot.mjs Q360779 sleepy-hollow
import { writeFileSync, mkdirSync } from "node:fs";
import { sparql, politeFetch } from "./wd.mjs";
import { burials, burialsQuery } from "./burials.mjs";

const [qid, slug] = process.argv.slice(2);
if (!qid || !slug) throw new Error("usage: snapshot.mjs <QID> <slug>");
const LIMIT = 80;
const split = (v) => (v ? v.split("|").filter(Boolean) : []);
const id = (uri) => uri?.split("/").pop();

const [cem] = await sparql(`
SELECT ?c ?cLabel ?cDescription ?coord ?fagc ?locLabel ?enwiki WHERE {
  VALUES ?c { wd:${qid} }
  OPTIONAL { ?c wdt:P625 ?coord } OPTIONAL { ?c wdt:P2025 ?fagc } OPTIONAL { ?c wdt:P131 ?loc }
  OPTIONAL { ?enwiki schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 1`);

const rows = await burials(qid, LIMIT);
console.error(`${rows.length} burials from Wikidata`);

// Wikipedia intro extracts, batched 20 titles per request (the per-page REST
// endpoint gets rate-limited fast from shared IPs).
const titleOf = (url) => decodeURIComponent(url.split("/wiki/")[1]).replaceAll("_", " ");
const summaries = new Map();
const titles = rows.filter((r) => r.enwiki).map((r) => titleOf(r.enwiki));
for (let i = 0; i < titles.length; i += 20) {
  const batch = titles.slice(i, i + 20);
  const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "extracts|info", exintro: "1", explaintext: "1", exlimit: "20", inprop: "url",
    titles: batch.join("|"),
  });
  const q = (await (await politeFetch(url)).json()).query;
  const alias = new Map();
  for (const n of [...(q.normalized ?? []), ...(q.redirects ?? [])]) alias.set(n.from, n.to);
  const byTitle = new Map(q.pages.filter((pg) => !pg.missing).map((pg) => [pg.title, pg]));
  for (const t of batch) {
    let k = t;
    for (let hops = 0; alias.has(k) && hops < 3; hops++) k = alias.get(k);
    const pg = byTitle.get(k);
    if (pg) summaries.set(t, { title: pg.title, extract: pg.extract, url: pg.fullurl, revision: pg.lastrevid });
  }
  console.error(`  summaries ${Math.min(i + 20, titles.length)}/${titles.length}`);
}

const people = rows.map((r) => ({
  qid: id(r.person),
  name: r.personLabel,
  description: r.personDescription ?? null,
  birth: r.birth ?? null, birthPrecision: r.birthPrecision ? +r.birthPrecision : null,
  death: r.death ?? null, deathPrecision: r.deathPrecision ? +r.deathPrecision : null,
  causesOfDeath: split(r.causes), mannersOfDeath: split(r.manners),
  occupations: split(r.occupations),
  image: r.image ?? null, graveImage: r.graveImage ?? null,
  graveCoord: r.graveCoord ?? r.personCoord ?? null,
  findAGraveId: r.findAGraveId ?? null,
  sitelinks: r.sitelinks ? +r.sitelinks : 0,
  wikipedia: r.enwiki ? summaries.get(titleOf(r.enwiki)) ?? null : null,
}));

const out = {
  cemetery: {
    qid, name: cem.cLabel, description: cem.cDescription ?? null, locatedIn: cem.locLabel ?? null,
    coord: cem.coord ?? null, findAGraveCemeteryId: cem.fagc ?? null, enwiki: cem.enwiki ?? null,
  },
  fetchedAt: new Date().toISOString(),
  sources: {
    wikidata: { license: "CC0 1.0", query: burialsQuery(qid, LIMIT).trim() },
    wikipedia: { license: "CC BY-SA 4.0", note: "Intro extracts from the MediaWiki Action API; attribute on every card." },
  },
  people,
};
mkdirSync("data/snapshots", { recursive: true });
const path = `data/snapshots/${slug}.json`;
writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${path}: ${people.length} people, ${people.filter((p) => p.wikipedia).length} with Wikipedia summaries`);
