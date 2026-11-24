// What FieldGuide.qml reads of its ListModel, narrowed: a row is a bird
// (`nobody` past the end), and the reader's sightings and notes are kept
// by Latin name so filtering the list never loses them.

export interface Bird {
  readonly name: string;
  readonly latin: string;
  readonly lengthCm: number;
  readonly wingspanCm: number;
  readonly season: string;
  readonly blurb: string;
}

export const nobody: Bird = { name: "", latin: "", lengthCm: 0, wingspanCm: 0, season: "", blurb: "" };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

// A row of the guide, or `nobody` for none.
export function birdOf(row: unknown): Bird {
  if (typeof row !== "object" || row === null || !("latin" in row)) return nobody;
  return {
    name: "name" in row ? text(row.name) : "",
    latin: text(row.latin),
    lengthCm: "lengthCm" in row ? number(row.lengthCm) : 0,
    wingspanCm: "wingspanCm" in row ? number(row.wingspanCm) : 0,
    season: "season" in row ? text(row.season) : "",
    blurb: "blurb" in row ? text(row.blurb) : "",
  };
}

// Where a row of the list shown stands in the guide.
export function atOf(row: unknown): number {
  return typeof row === "object" && row !== null && "at" in row && typeof row.at === "number" ? row.at : 0;
}

export function isSeen(seen: readonly string[], latin: string): boolean {
  return seen.indexOf(latin) >= 0;
}

export function setSeen(seen: readonly string[], latin: string, mark: boolean): string[] {
  const next: string[] = [];
  for (const one of seen) {
    if (one !== latin) next.push(one);
  }
  if (mark) next.push(latin);
  return next;
}

export interface Note {
  readonly latin: string;
  readonly text: string;
}

export function noteFor(notes: readonly Note[], latin: string): string {
  for (const note of notes) {
    if (note.latin === latin) return note.text;
  }
  return "";
}

export function setNote(notes: readonly Note[], latin: string, said: string): Note[] {
  const next: Note[] = [];
  for (const note of notes) {
    if (note.latin !== latin) next.push(note);
  }
  next.push({ latin, text: said });
  return next;
}
