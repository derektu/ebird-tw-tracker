import { useRef, useState } from "react";

export type BirdSpotIntent = {
  kind:
    | "notification"
    | "search"
    | "mode"
    | "open-manager"
    | "close-manager"
    | "select"
    | "detail"
    | "back"
    | "remove"
    | "cancel-edit";
  run(): void;
};
export interface BirdSpotEditor {
  key: string;
  dirty: boolean;
  save(): Promise<boolean>;
  discard(): void;
}
type LeaveState =
  { kind: "idle" } | { kind: "confirm" | "saving"; intent: BirdSpotIntent };

export function useBirdSpotNavigation(owner: string) {
  const editor = useRef<BirdSpotEditor | null>(null);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [leave, setLeave] = useState<LeaveState>({ kind: "idle" });
  const leaveRef = useRef(leave);
  const changeLeave = (next: LeaveState) => {
    leaveRef.current = next;
    setLeave(next);
  };
  const epoch = useRef(0);
  const requestLeave = (intent: BirdSpotIntent) => {
    if (leaveRef.current.kind !== "idle") return;
    const current = editor.current;
    if (current?.key === ownerRef.current && current.dirty)
      changeLeave({ kind: "confirm", intent });
    else intent.run();
  };
  const resolveLeave = async (choice: "save" | "discard" | "continue") => {
    if (leave.kind !== "confirm") return;
    if (choice === "continue") {
      changeLeave({ kind: "idle" });
      return;
    }
    const token = ++epoch.current;
    const current = editor.current;
    if (choice === "save") {
      changeLeave({ kind: "saving", intent: leave.intent });
      if (!current || !(await current.save())) {
        if (token === epoch.current)
          changeLeave({ kind: "confirm", intent: leave.intent });
        return;
      }
    } else current?.discard();
    if (token !== epoch.current) return;
    changeLeave({ kind: "idle" });
    leave.intent.run();
  };
  const cancelLeave = () => {
    epoch.current++;
    changeLeave({ kind: "idle" });
  };
  return { editor, leave, requestLeave, resolveLeave, cancelLeave };
}
