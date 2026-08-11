function normalizeSpeciesCode(speciesCode) {
  return String(speciesCode ?? "").trim().toLowerCase();
}

function normalizeDays(days) {
  const numericDays = Number(days);
  if (!Number.isFinite(numericDays)) return 1;
  return Math.max(1, Math.min(Math.trunc(numericDays), 30));
}

export function createSearchScope(speciesCode, days) {
  const normalizedSpeciesCode = normalizeSpeciesCode(speciesCode);
  const normalizedDays = normalizeDays(days);
  return {
    speciesCode: normalizedSpeciesCode,
    days: normalizedDays,
    key: `${normalizedSpeciesCode}:${normalizedDays}`,
  };
}

export function createChecklistIdentity(speciesCode, subId) {
  return `${normalizeSpeciesCode(speciesCode)}:${String(subId ?? "").trim()}`;
}

export function createSearchSnapshot(scope, observations, recordedAt) {
  return {
    scope,
    recordedAt,
    identityIds: [...new Set(observations.map((observation) => createChecklistIdentity(scope.speciesCode, observation.subId)))],
  };
}

export function compareSearchSnapshot(scope, observations, baseline) {
  const snapshot = createSearchSnapshot(scope, observations, new Date(0).toISOString());
  if (!baseline) {
    return {
      status: "baseline-created",
      baselineAt: null,
      discoveryIds: [],
      observations,
      snapshot,
    };
  }

  const baselineIds = new Set(baseline.identityIds);
  const discoveryIds = snapshot.identityIds.filter((identity) => !baselineIds.has(identity));
  const discoveries = new Set(discoveryIds);
  return {
    status: "compared",
    baselineAt: baseline.recordedAt,
    discoveryIds,
    observations: [
      ...observations.filter((observation) => discoveries.has(createChecklistIdentity(scope.speciesCode, observation.subId))),
      ...observations.filter((observation) => !discoveries.has(createChecklistIdentity(scope.speciesCode, observation.subId))),
    ],
    snapshot,
  };
}
