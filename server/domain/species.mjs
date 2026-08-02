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
