// Whether the page may make sound. A browser refuses it until the user has
// done something with the page, unless it was told otherwise; it does not
// say which, so the first to ask plays a moment of silence to find out.
import { atNextGesture } from "../QtQuick/activation.ts";

// A WAV of eight silent samples.
const SILENCE = "data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==";

let allowed = false;
let asked = false;
const waiting = new Set();

function allow() {
  if (allowed) return;
  allowed = true;
  const works = [...waiting];
  waiting.clear();
  for (const work of works) work();
}

export function audible() {
  if (!allowed && navigator.userActivation?.hasBeenActive) allow();
  return allowed;
}

// Runs `work` once sound is allowed: now if it is. What it returns calls
// that off.
export function whenAudible(work) {
  if (audible()) {
    work();
    return () => {};
  }
  waiting.add(work);
  if (!asked) {
    asked = true;
    atNextGesture(allow);
    const probe = new Audio(SILENCE);
    // Refused: the gesture will tell.
    probe.play()?.then(allow, () => {});
  }
  return () => void waiting.delete(work);
}
