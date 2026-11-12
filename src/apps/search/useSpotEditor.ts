import { useRef, useState } from "react";
import { useBirdSpotNavigation, type BirdSpotIntent } from "../../features/bird-spots/navigation";
import type { BirdSpot } from "../../types/domain";
import type { SearchBirdSpots, SpotFields } from "./useSearchBirdSpots";

interface Draft {
  session: number;
  kind: "note" | "metadata";
  spot: BirdSpot;
  baseline: SpotFields;
  fields: SpotFields;
  revision: number;
}

export function useSpotEditor(model: SearchBirdSpots) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const current = useRef(draft);
  const sequence = useRef(0);
  const saving = useRef<{ session: number; result: Promise<boolean> } | null>(null);
  const owner = draft ? String(draft.session) : "";
  const nav = useBirdSpotNavigation(owner);
  const replace = (next: Draft | null) => {
    current.current = next;
    setDraft(next);
  };
  const begin = (kind: Draft["kind"], spot: BirdSpot) => {
    const saved = model.saved(spot.locId);
    const fields = { alias: saved?.alias ?? "", note: saved?.note ?? "", pinned: saved?.pinned ?? false };
    replace({ kind, spot, session: ++sequence.current, revision: 0, baseline: fields, fields });
  };
  const change = (fields: Partial<SpotFields>) => {
    const previous = current.current;
    if (previous) replace({ ...previous, fields: { ...previous.fields, ...fields }, revision: previous.revision + 1 });
  };
  const commit = async (submitted: Draft) => {
    const { baseline, fields, spot } = submitted;
    const changedFields = {
      ...(baseline.alias !== fields.alias && { alias: fields.alias }),
      ...(baseline.note !== fields.note && { note: fields.note }),
      ...(baseline.pinned !== fields.pinned && { pinned: fields.pinned }),
    };
    const ok = submitted.kind === "note"
      ? await model.saveNote(spot, fields.note)
      : await model.update(spot.locId, changedFields);
    const latest = current.current;
    if (!ok || latest?.session !== submitted.session) return false;
    replace({ ...latest, baseline: fields });
    return latest.revision === submitted.revision;
  };
  const save = () => {
    const submitted = current.current;
    if (!submitted) return Promise.resolve(false);
    if (saving.current?.session === submitted.session) return saving.current.result;
    const result = commit(submitted).finally(() => {
      if (saving.current?.session === submitted.session) saving.current = null;
    });
    saving.current = { session: submitted.session, result };
    return result;
  };
  const dirty = Boolean(draft && (draft.fields.alias !== draft.baseline.alias || draft.fields.note !== draft.baseline.note || draft.fields.pinned !== draft.baseline.pinned));
  const end = () => replace(null);
  nav.editor.current = { key: owner, dirty, save, discard: end };
  const request = (kind: BirdSpotIntent["kind"], run: () => void) => nav.requestLeave({ kind, run: () => { end(); run(); } });
  const submit = async (done: () => void) => {
    const session = current.current?.session;
    if (await save() && current.current?.session === session && !nav.hasPendingLeave()) { end(); done(); }
  };
  return { draft, begin, change, submit, request, leave: nav.leave, resolveLeave: nav.resolveLeave };
}
export type SpotEditor = ReturnType<typeof useSpotEditor>;
