// What the showcase drives of a ljos-play world it runs (SnailPostDemo.qml)
// from outside: the world is the app's root, known to the file that loads
// it only as an unknown value, and its clock is ljos-play's own.

interface Clock {
  readonly walking: boolean
  checkClock(): void
  tick(dt: number): void
}

function isClock(value: unknown): value is Clock {
  return (
    typeof value === "object" &&
    value !== null &&
    "tick" in value &&
    typeof value.tick === "function" &&
    "checkClock" in value &&
    typeof value.checkClock === "function"
  )
}

// The world's own beat: a step every 40 ms while something walks, every
// 200 ms while all stand (ljos-play's World).
export function beat(world: unknown): number {
  return isClock(world) && world.walking ? 40 : 200
}

// How often a world slowed to `pace` of its time steps: less often than
// its own beat. Each step is still one of its own (`step`), because a
// walker moves at least a pixel a step however short the step: a slow
// snail goes no slower for shorter steps, only for fewer.
export function slowBeat(world: unknown, pace: number): number {
  return beat(world) / pace
}

// One step of the world's clock, as its own timer takes it.
export function step(world: unknown): void {
  if (!isClock(world)) return
  world.checkClock()
  world.tick(beat(world))
}

// What the Observer is on for a frame that holds the example: the world
// it names as its own (`observed`), else the frame.
export function observedOf(item: unknown): unknown {
  return typeof item === "object" && item !== null && "observed" in item ? item.observed : item
}

// A file of the example's project (<name>-project.json, written by the
// build): its path, its text and its text as coloured code.
interface File {
  readonly path: string
  readonly code: string
  readonly rich: string
}

function isFile(value: unknown): value is File {
  return typeof value === "object" && value !== null && "path" in value && "code" in value && typeof value.code === "string"
}

export function fileIn(project: unknown, path: string): unknown {
  const none: unknown[] = []
  const files = typeof project === "object" && project !== null && "files" in project && Array.isArray(project.files) ? project.files : none
  return files.find((file: unknown) => isFile(file) && file.path === path)
}

export function codeOf(file: unknown): string {
  return isFile(file) ? file.code : ""
}

export function richOf(file: unknown): string {
  return isFile(file) && typeof file.rich === "string" ? file.rich : ""
}

// The reader's edit, as example-live.js takes edits: by the file's path.
export function edits(path: string, text: string): Record<string, string> {
  const made: Record<string, string> = {}
  made[path] = text
  return made
}

export function messageOf(error: unknown): string {
  if (typeof error === "string") return error
  return typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : ""
}
