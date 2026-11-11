export const BIRD_SPOT_LEAVE_EVENT = "bird-spots:before-leave";

export function confirmBirdSpotExit() {
  return window.dispatchEvent(new Event(BIRD_SPOT_LEAVE_EVENT, { cancelable: true }));
}
