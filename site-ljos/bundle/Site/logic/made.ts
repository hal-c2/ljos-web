// An app or tool made with Ljós, as Site/BuiltWith.qml shows it: its
// card's words, where its source is, and its capture.
export interface Made {
  readonly name: string;
  readonly title: string;
  readonly href: string;
  readonly body: string;
  // The page `body` links to, "" for none, and the words the card has
  // there instead, without a link to the page the reader is on.
  readonly bodyAt: string;
  readonly bodyThere: string;
  readonly picture: string;
  // "" where the capture has no dark one.
  readonly pictureDark: string;
  readonly alt: string;
}

// Those `names` asks for, in its order; a name none has is left out.
export function pick(all: readonly Made[], names: readonly string[]): Made[] {
  const picked: Made[] = [];
  for (const name of names) {
    for (const one of all) {
      if (one.name === name) picked.push(one);
    }
  }
  return picked;
}

// The heights of `count` cards, with the one at `at` now `height`; a card
// that has not said yet is 0.
export function withHeight(heights: readonly number[], count: number, at: number, height: number): number[] {
  const next: number[] = [];
  for (let i = 0; i < count; ++i) next.push(i === at ? height : heights[i] ?? 0);
  return next;
}

// The tallest of the heights given, 0 for none.
export function tallest(heights: readonly number[]): number {
  return heights.reduce((most, one) => Math.max(most, one), 0);
}

// How many cards stand side by side on a wide page: up to three in a row,
// but four as two rows of two, so no card stands alone under the others.
export function columns(count: number): number {
  return count === 4 ? 2 : Math.min(3, count);
}

// A card's words on the page at `route`: on the page its words link to,
// those that leave the link out.
export function wordsOn(made: Made, route: string): string {
  return made.bodyAt !== "" && made.bodyAt === route ? made.bodyThere : made.body;
}
