import { normalizeSpecies, normalizeText } from "../domain/species.mjs";
import { readJson, writeJson } from "../storage/json-store.mjs";

export function createSpeciesService({ ebird, savedSpeciesPath, taxonomyCachePath, now = () => new Date() }) {
  async function taxonomy() {
    const cached = await readJson(taxonomyCachePath, null);
    const current = now();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    if (cached?.fetchedAt && Array.isArray(cached.items) && current.getTime() - Date.parse(cached.fetchedAt) < maxAgeMs) {
      return cached.items;
    }
    const items = await ebird.request("/ref/taxonomy/ebird", { locale: "zh", fmt: "json" });
    await writeJson(taxonomyCachePath, { fetchedAt: current.toISOString(), items });
    return items;
  }

  async function search(query) {
    const term = normalizeText(query);
    if (!term) return [];
    const exact = [];
    const startsWith = [];
    const contains = [];
    for (const item of await taxonomy()) {
      if (item.category && item.category !== "species" && item.category !== "issf") continue;
      const fields = [item.comName, item.sciName, item.speciesCode].map(normalizeText);
      const normalized = normalizeSpecies(item);
      if (fields.some((value) => value === term)) exact.push(normalized);
      else if (fields.some((value) => value.startsWith(term))) startsWith.push(normalized);
      else if (fields.some((value) => value.includes(term))) contains.push(normalized);
    }
    return [...exact, ...startsWith, ...contains].slice(0, 20);
  }

  async function listSaved() {
    return readJson(savedSpeciesPath, []);
  }

  async function save(species) {
    const saved = await listSaved();
    const normalized = normalizeSpecies(species);
    const next = [normalized, ...saved.filter((item) => item.speciesCode !== normalized.speciesCode)].slice(0, 50);
    await writeJson(savedSpeciesPath, next);
    return next;
  }

  async function resolve(query) {
    const candidates = await search(query);
    const species = candidates[0] ?? null;
    if (species) await save(species);
    return { species, candidates };
  }

  return { search, resolve, listSaved, save };
}
