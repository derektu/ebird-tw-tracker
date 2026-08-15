import assert from "node:assert/strict";
import test from "node:test";
import { searchTaxonomy } from "../server/domain/species.mjs";
import { mapObservations } from "../server/domain/observations.mjs";

const taxonomy = [
  { speciesCode: "grpsni1", comName: "彩鷸", sciName: "Rostratula benghalensis", category: "species" },
  { speciesCode: "comsan", comName: "磯鷸", sciName: "Actitis hypoleucos", category: "species" },
  { speciesCode: "comsanx", comName: "磯鷸雜交種", sciName: "Actitis sp.", category: "hybrid" },
  { speciesCode: "issfsp1", comName: "磯鷸亞種", sciName: "Actitis hypoleucos ssp.", category: "issf" },
];

test("searchTaxonomy ranks exact matches over prefix matches over substring matches", () => {
  const results = searchTaxonomy(taxonomy, "磯鷸");
  assert.deepEqual(results.map((species) => species.speciesCode), ["comsan", "issfsp1"]);
});

test("searchTaxonomy matches Chinese name, English name, or species code", () => {
  assert.equal(searchTaxonomy(taxonomy, "grpsni1")[0].speciesCode, "grpsni1");
  assert.equal(searchTaxonomy(taxonomy, "Rostratula benghalensis")[0].speciesCode, "grpsni1");
  assert.equal(searchTaxonomy(taxonomy, "彩鷸")[0].speciesCode, "grpsni1");
});

test("searchTaxonomy excludes non-species, non-issf categories such as hybrids", () => {
  const results = searchTaxonomy(taxonomy, "磯鷸");
  assert.ok(!results.some((species) => species.speciesCode === "comsanx"));
});

test("searchTaxonomy returns an empty list for a blank query", () => {
  assert.deepEqual(searchTaxonomy(taxonomy, "   "), []);
});

test("mapObservations keeps only records with finite coordinates, newest first", () => {
  const items = [
    { speciesCode: "a", obsDt: "2026-08-10 07:00", subId: "S1", lat: 24.1, lng: 121.1, howMany: 2 },
    { speciesCode: "a", obsDt: "2026-08-12 07:00", subId: "S2", lat: null, lng: null, howMany: 1 },
    { speciesCode: "a", obsDt: "2026-08-11 07:00", subId: "S3", lat: 24.2, lng: 121.2, howMany: null },
  ];
  const mapped = mapObservations(items);
  assert.deepEqual(mapped.map((observation) => observation.subId), ["S3", "S1"]);
  assert.equal(mapped[0].howMany, null);
});
