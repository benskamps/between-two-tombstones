import { sparql } from "./wd.mjs";

// One row per person buried at the cemetery. Multi-valued fields are |-joined.
export const burialsQuery = (qid, limit = 1000) => `
SELECT ?person ?personLabel ?personDescription
  (SAMPLE(?birth_) AS ?birth) (SAMPLE(?birthPrec_) AS ?birthPrecision)
  (SAMPLE(?death_) AS ?death) (SAMPLE(?deathPrec_) AS ?deathPrecision)
  (GROUP_CONCAT(DISTINCT ?causeLabel_; separator="|") AS ?causes)
  (GROUP_CONCAT(DISTINCT ?mannerLabel_; separator="|") AS ?manners)
  (GROUP_CONCAT(DISTINCT ?occLabel_; separator="|") AS ?occupations)
  (SAMPLE(?image_) AS ?image) (SAMPLE(?graveImage_) AS ?graveImage)
  (SAMPLE(?graveCoord_) AS ?graveCoord) (SAMPLE(?personCoord_) AS ?personCoord)
  (SAMPLE(?fag_) AS ?findAGraveId) (SAMPLE(?sitelinks_) AS ?sitelinks)
  (SAMPLE(?enwiki_) AS ?enwiki)
WHERE {
  # The top ${limit} people first (most sitelinks, ties by QID number), then the
  # details for those only: Arlington lists 4,000+ people, and joining every
  # OPTIONAL for all of them before the cut took 51 s or timed out.
  {
    SELECT DISTINCT ?person ?sitelinks_ WHERE {
      ?person p:P119 ?top . ?top ps:P119 wd:${qid} .
      OPTIONAL { ?person wikibase:sitelinks ?sitelinks_ }
    }
    ORDER BY DESC(?sitelinks_) xsd:integer(STRAFTER(STR(?person), "/entity/Q"))
    LIMIT ${limit}
  }
  ?person p:P119 ?burial . ?burial ps:P119 wd:${qid} .
  OPTIONAL { ?burial pq:P625 ?graveCoord_ }
  # Best-rank statements only: Margaret Mitchell (Q173540) has a preferred
  # Nov 8 and a normal-rank Nov 9 birth date, and SAMPLE over all ranks can
  # pick the wrong one.
  OPTIONAL { ?person p:P569 ?bst . ?bst a wikibase:BestRank ; psv:P569 [ wikibase:timeValue ?birth_ ; wikibase:timePrecision ?birthPrec_ ] }
  OPTIONAL { ?person p:P570 ?dst . ?dst a wikibase:BestRank ; psv:P570 [ wikibase:timeValue ?death_ ; wikibase:timePrecision ?deathPrec_ ] }
  # Labels in English, else "mul" (Wikidata's language-neutral labels, where
  # many names now live only). Same as labelEnMul in lib/data/wikidata.ts.
  OPTIONAL { ?person wdt:P509 ?cause .
    OPTIONAL { ?cause rdfs:label ?causeLabel_en FILTER(LANG(?causeLabel_en) = "en") }
    OPTIONAL { ?cause rdfs:label ?causeLabel_mul FILTER(LANG(?causeLabel_mul) = "mul") }
    BIND(COALESCE(?causeLabel_en, ?causeLabel_mul) AS ?causeLabel_) }
  OPTIONAL { ?person wdt:P1196 ?manner .
    OPTIONAL { ?manner rdfs:label ?mannerLabel_en FILTER(LANG(?mannerLabel_en) = "en") }
    OPTIONAL { ?manner rdfs:label ?mannerLabel_mul FILTER(LANG(?mannerLabel_mul) = "mul") }
    BIND(COALESCE(?mannerLabel_en, ?mannerLabel_mul) AS ?mannerLabel_) }
  OPTIONAL { ?person wdt:P106 ?occ .
    OPTIONAL { ?occ rdfs:label ?occLabel_en FILTER(LANG(?occLabel_en) = "en") }
    OPTIONAL { ?occ rdfs:label ?occLabel_mul FILTER(LANG(?occLabel_mul) = "mul") }
    BIND(COALESCE(?occLabel_en, ?occLabel_mul) AS ?occLabel_) }
  OPTIONAL { ?person wdt:P18 ?image_ }
  OPTIONAL { ?person wdt:P1442 ?graveImage_ }
  OPTIONAL { ?person wdt:P625 ?personCoord_ }
  OPTIONAL { ?person wdt:P535 ?fag_ }
  OPTIONAL { ?enwiki_ schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
GROUP BY ?person ?personLabel ?personDescription
# Ties on sitelinks are broken by the QID's number (lowest first) so the LIMIT
# cut is the same on every run. Keep this ORDER BY identical to burialsQuery in
# lib/data/wikidata.ts.
ORDER BY DESC(?sitelinks) xsd:integer(STRAFTER(STR(?person), "/entity/Q"))
LIMIT ${limit}`;

export const burials = (qid, limit) => sparql(burialsQuery(qid, limit));
