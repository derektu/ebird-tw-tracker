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
 * code query: exact matches first, then prefix matches, then substring
 * matches, each in taxonomy order.
 */
export function searchTaxonomy(taxonomy, query, limit = 20) {
  const term = normalizeText(query);
  if (!term) return [];
  const exact = [];
  const startsWith = [];
  const contains = [];
  for (const item of taxonomy) {
    if (item.category && !searchableCategories.has(item.category)) continue;
    const fields = [item.comName, item.sciName, item.speciesCode].map(normalizeText);
    const normalized = normalizeSpecies(item);
    if (fields.some((value) => value === term)) exact.push(normalized);
    else if (fields.some((value) => value.startsWith(term))) startsWith.push(normalized);
    else if (fields.some((value) => value.includes(term))) contains.push(normalized);
  }
  return [...exact, ...startsWith, ...contains].slice(0, limit);
}
