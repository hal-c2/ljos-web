// How far down the window a point is, of what `mapToItem` answered: its
// answer has no type in the API (a point or a rectangle, by what it is
// given), so this reads the `y` of it.
export function topOf(point: unknown): number {
  return typeof point === "object" && point !== null && "y" in point && typeof point.y === "number" ? point.y : 0;
}

// Whether what loads a page says it is wide; a page with no word on it is.
export function wideIn(loader: unknown): boolean {
  return typeof loader === "object" && loader !== null && "wide" in loader && typeof loader.wide === "boolean" ? loader.wide : true;
}
