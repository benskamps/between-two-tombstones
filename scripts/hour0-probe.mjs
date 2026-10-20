import { sparql, politeFetch } from "./wd.mjs";
import { burials } from "./burials.mjs";

const CEMS = { Q360779: "Sleepy Hollow Cemetery (NY)", Q872253: "Lake View Cemetery (Seattle)" };

const facts = await sparql(`
SELECT ?c ?coord ?fagc ?isCemetery (GROUP_CONCAT(DISTINCT ?typeLabel; separator="|") AS ?types) WHERE {
  VALUES ?c { ${Object.keys(CEMS).map((q) => "wd:" + q).join(" ")} }
  OPTIONAL { ?c wdt:P625 ?coord } OPTIONAL { ?c wdt:P2025 ?fagc }
  OPTIONAL { ?c wdt:P31 ?t . ?t rdfs:label ?typeLabel FILTER(LANG(?typeLabel) = "en") }
  BIND(EXISTS { ?c wdt:P31/wdt:P279* wd:Q39614 } AS ?isCemetery)
} GROUP BY ?c ?coord ?fagc ?isCemetery`);
for (const f of facts) console.log("CEMETERY", f.c.split("/").pop(), "| P31:", f.types, "| Q39614 (via subclass ok):", f.isCemetery, "| P625:", f.coord, "| P2025:", f.fagc);

const FIELDS = ["birth", "death", "causes", "manners", "occupations", "image", "graveImage", "graveCoord", "personCoord", "findAGraveId", "enwiki"];
for (const [qid, name] of process.env.SKIP_BURIALS ? [] : Object.entries(CEMS)) {
  const rows = await burials(qid);
  const counts = Object.fromEntries(FIELDS.map((k) => [k, rows.filter((r) => r[k]).length]));
  console.log(`\nBURIALS ${name}: ${rows.length} people`);
  console.log(JSON.stringify(counts));
  console.log("top 8 by sitelinks:", rows.slice(0, 8).map((r) => `${r.personLabel} (${r.sitelinks})`).join(", "));
}

// Overpass: cemeteries + named graves near each cemetery coordinate
const near = { "Sleepy Hollow": [41.0956, -73.8607], "Lake View": [47.6339, -122.3158] };
for (const [name, [lat, lon]] of Object.entries(near)) {
  const q = `[out:json][timeout:25];
(nwr["landuse"="cemetery"](around:5000,${lat},${lon});nwr["amenity"="grave_yard"](around:5000,${lat},${lon}););out tags center;
(nwr["cemetery"="grave"]["name"](around:1500,${lat},${lon});nwr["historic"~"^(tomb|memorial)$"]["name"](around:1500,${lat},${lon}););out tags center;`;
  let els;
  try {
    const res = await politeFetch("https://overpass-api.de/api/interpreter", {
      method: "POST", body: "data=" + encodeURIComponent(q),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }, { maxRetries: 1 });
    els = (await res.json()).elements;
  } catch (err) {
    console.log(`\nOVERPASS ${name}: COULDN'T CHECK (${err.cause?.code ?? err.message})`);
    continue;
  }
  const cems = els.filter((e) => e.tags?.landuse === "cemetery" || e.tags?.amenity === "grave_yard");
  const graves = els.filter((e) => !cems.includes(e));
  const named = cems.filter((e) => e.tags.name);
  console.log(`\nOVERPASS 5km ${name}: ${cems.length} cemetery features, ${named.length} named, wikidata= ${cems.filter((e) => e.tags.wikidata).length}, ref:find_a_grave= ${cems.filter((e) => e.tags["ref:find_a_grave"]).length}`);
  console.log(`  named graves/tombs/memorials within 1.5km: ${graves.length}`, graves.slice(0, 6).map((g) => `${g.tags.name} [${g.tags.cemetery ?? g.tags.historic}${g.tags.wikidata ? " " + g.tags.wikidata : ""}]`).join("; "));
}

// Search route shape: mwapi EntitySearch filtered to cemeteries, with admin area
const s = await sparql(`
SELECT ?item ?itemLabel ?locLabel WHERE {
  SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch";
    mwapi:search "lake view cemetery"; mwapi:language "en"; mwapi:limit "50". ?item wikibase:apiOutputItem mwapi:item. }
  ?item wdt:P31/wdt:P279* wd:Q39614 . OPTIONAL { ?item wdt:P131 ?loc }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 10`);
console.log("\nSEARCH 'lake view cemetery':", s.length, "hits →", s.slice(0, 5).map((r) => `${r.itemLabel} (${r.locLabel ?? "?"})`).join("; "));

// Near route shape: wikibase:around 3 km of Lake View
const a = await sparql(`
SELECT ?c ?cLabel ?dist WHERE {
  SERVICE wikibase:around { ?c wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(-122.3158 47.6339)"^^geo:wktLiteral ; wikibase:radius "3" ; wikibase:distance ?dist . }
  ?c wdt:P31/wdt:P279* wd:Q39614 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY ?dist LIMIT 10`);
console.log("AROUND Lake View 3km:", a.map((r) => `${r.cLabel} ${(+r.dist).toFixed(2)}km`).join("; "));
