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
  ?person p:P119 ?burial . ?burial ps:P119 wd:${qid} .
  OPTIONAL { ?burial pq:P625 ?graveCoord_ }
  OPTIONAL { ?person p:P569/psv:P569 [ wikibase:timeValue ?birth_ ; wikibase:timePrecision ?birthPrec_ ] }
  OPTIONAL { ?person p:P570/psv:P570 [ wikibase:timeValue ?death_ ; wikibase:timePrecision ?deathPrec_ ] }
  OPTIONAL { ?person wdt:P509 ?cause . ?cause rdfs:label ?causeLabel_ FILTER(LANG(?causeLabel_) = "en") }
  OPTIONAL { ?person wdt:P1196 ?manner . ?manner rdfs:label ?mannerLabel_ FILTER(LANG(?mannerLabel_) = "en") }
  OPTIONAL { ?person wdt:P106 ?occ . ?occ rdfs:label ?occLabel_ FILTER(LANG(?occLabel_) = "en") }
  OPTIONAL { ?person wdt:P18 ?image_ }
  OPTIONAL { ?person wdt:P1442 ?graveImage_ }
  OPTIONAL { ?person wdt:P625 ?personCoord_ }
  OPTIONAL { ?person wdt:P535 ?fag_ }
  OPTIONAL { ?person wikibase:sitelinks ?sitelinks_ }
  OPTIONAL { ?enwiki_ schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?person ?personLabel ?personDescription
ORDER BY DESC(?sitelinks)
LIMIT ${limit}`;

export const burials = (qid, limit) => sparql(burialsQuery(qid, limit));
