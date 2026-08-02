import { normalizeSpecies } from "./species.mjs";

export function observationKey(observation) {
  return [observation.speciesCode, observation.subId, observation.obsDt, observation.lat, observation.lng].join("|");
}

export function normalizeClockTime(value, fallback) {
  const text = String(value ?? fallback);
  if (!/^\d{2}:\d{2}$/.test(text)) return fallback;
  const [hours, minutes] = text.split(":").map(Number);
  return hours <= 23 && minutes <= 59 ? text : fallback;
}

export function normalizeQuietHours(input = {}) {
  return {
    enabled: Boolean(input.enabled),
    start: normalizeClockTime(input.start, "22:00"),
    end: normalizeClockTime(input.end, "06:00"),
  };
}

export function normalizeTracker(input, now = new Date()) {
  const species = normalizeSpecies(input.species ?? input);
  const daysRaw = Number.parseInt(input.days ?? "3", 10);
  const intervalRaw = Number.parseInt(input.intervalMinutes ?? "30", 10);
  return {
    id: species.speciesCode,
    species,
    days: Number.isFinite(daysRaw) ? Math.max(1, Math.min(daysRaw, 30)) : 3,
    intervalMinutes: Number.isFinite(intervalRaw) ? Math.max(1, Math.min(intervalRaw, 1440)) : 30,
    enabled: input.enabled !== false,
    quietHours: normalizeQuietHours(input.quietHours),
    lastCheckedAt: input.lastCheckedAt ?? null,
    lastFoundAt: input.lastFoundAt ?? null,
    createdAt: input.createdAt ?? now.toISOString(),
    ...(input.lastError ? { lastError: input.lastError } : {}),
  };
}

export function clockMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isInQuietHours(quietHours, date = new Date()) {
  if (!quietHours?.enabled) return false;
  const start = clockMinutes(quietHours.start);
  const end = clockMinutes(quietHours.end);
  const now = date.getHours() * 60 + date.getMinutes();
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export function trackerIsDue(tracker, now = new Date()) {
  if (!tracker.enabled || isInQuietHours(tracker.quietHours, now)) return false;
  if (!tracker.lastCheckedAt) return true;
  const elapsed = now.getTime() - Date.parse(tracker.lastCheckedAt);
  return elapsed >= tracker.intervalMinutes * 60_000;
}
