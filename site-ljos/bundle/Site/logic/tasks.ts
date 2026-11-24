// The front page's live app (Site/HeroApp.qml) and the recorded agent
// session that drives it (Site/HeroStage.qml).

// A task on the list.
export interface Task {
  readonly title: string;
  readonly done: boolean;
}

// What the agent acts on: "title", "progress", a task's index, or "".
export type Pointing = string | number;

// A call of the recorded session: as the agent sent it, and what it does
// to the running app, which answers with what it now holds.
export interface Step {
  readonly tool: string;
  readonly args: string;
  readonly act: () => string;
}

// A call sent, with its answer, as Running.calls keeps them.
export interface Call {
  readonly tool: string;
  readonly args: string;
  readonly said: string;
}

// A line of the Observer's tree: an object, the value it shows, and the
// part of the app it rings when hovered.
export interface Line {
  readonly depth: number;
  readonly type: string;
  readonly name: string;
  readonly key: string;
  readonly value: string;
  readonly point: Pointing;
}

// The calls sent so far with one more. Running.calls is the shell's
// (Site/Running.qml), a list it has no type for.
export function withCall(calls: unknown, call: Call): readonly unknown[] {
  return Array.isArray(calls) ? calls.concat([call]) : [call];
}

// Where the task of that title is in the list, or -1.
export function indexOf(tasks: readonly Task[], title: string): number {
  for (let at = 0; at < tasks.length; at++) {
    if (tasks[at]?.title === title) return at;
  }
  return -1;
}
