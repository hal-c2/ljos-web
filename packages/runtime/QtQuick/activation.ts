// What a browser allows only while the user is doing something with the
// page: a file picker, a colour picker, the first sound. It calls that user
// activation, and a press or a key gives it.
const EVENTS = ["pointerdown", "pointerup", "mousedown", "keydown", "touchend"];
const CAPTURE = { capture: true };

let waiting = new Set<() => void>();
let listening = false;

// Whether the browser counts what is being handled: a key like Escape, or
// an event a script made, gives nothing.
function counts(event: Event): boolean {
  const activation = navigator.userActivation;
  return activation ? activation.isActive : event.isTrusted;
}

function gesture(event: Event): void {
  if (!counts(event)) return;
  // What is refused again waits for the next one.
  const works = waiting;
  waiting = new Set();
  listen(false);
  for (const work of works) work();
}

function listen(on: boolean): void {
  if (listening === on) return;
  listening = on;
  for (const type of EVENTS) {
    if (on) window.addEventListener(type, gesture, CAPTURE);
    else window.removeEventListener(type, gesture, CAPTURE);
  }
}

// Runs `work` inside the user's next press or key, while the browser still
// allows what it refused. What it returns calls that off.
export function atNextGesture(work: () => void): () => void {
  waiting.add(work);
  listen(true);
  return () => {
    waiting.delete(work);
    if (!waiting.size) listen(false);
  };
}
