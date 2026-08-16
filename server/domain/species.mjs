export function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKC");
}

export function normalizeSpecies(record) {
  return {
    speciesCode: record.speciesCode,
    comName: record.comName,
    sciName: record.sciName,
    category: record.category,
    taxonOrder: record.taxonOrder,
  };
}

const searchableCategories = new Set(["species", "issf"]);

/**
 * Rank taxonomy entries against a Chinese name, English name, or species
 * code query into exact, prefix, and substring match tiers, each in
 * taxonomy order.
 */
function rankTaxonomy(taxonomy, query) {
  const term = normalizeText(query);
  const exact = [];
  const startsWith = [];
  const contains = [];
  if (!term) return { exact, startsWith, contains };
  for (const item of taxonomy) {
    if (item.category && !searchableCategories.has(item.category)) continue;
    const fields = [item.comName, item.sciName, item.speciesCode].map(normalizeText);
    const normalized = normalizeSpecies(item);
    if (fields.some((value) => value === term)) exact.push(normalized);
    else if (fields.some((value) => value.startsWith(term))) startsWith.push(normalized);
    else if (fields.some((value) => value.includes(term))) contains.push(normalized);
  }
  return { exact, startsWith, contains };
}

/**
 * Rank taxonomy entries against a Chinese name, English name, or species
 * code query: exact matches first, then prefix matches, then substring
 * matches, each in taxonomy order.
 */
export function searchTaxonomy(taxonomy, query, limit = 20) {
  const { exact, startsWith, contains } = rankTaxonomy(taxonomy, query);
  return [...exact, ...startsWith, ...contains].slice(0, limit);
}

/**
 * Resolve a query to a single species only when the match is unambiguous
 * enough to act on: an exact match, or otherwise a prefix match. A query
 * that matches only as a substring returns no resolved species, since a
 * short or partial query can substring-match an unrelated bird. The full
 * ranked candidate list is always returned for the caller to offer as
 * suggestions.
 */
export function resolveTaxonomyMatch(taxonomy, query, limit = 20) {
  const { exact, startsWith, contains } = rankTaxonomy(taxonomy, query);
  const species = exact[0] ?? startsWith[0] ?? null;
  const candidates = [...exact, ...startsWith, ...contains].slice(0, limit);
  return { species, candidates };
}
