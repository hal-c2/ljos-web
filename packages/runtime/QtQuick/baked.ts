// What a shader baked by Qt's `qsb` tool holds: for the page and for the build.

// In what `qsb` bakes, uncompressed, each shader is its length and its text,
// and the text says in its first line what it is written for.
export function heldShader(held: Uint8Array): string | null {
  const view = new DataView(held.buffer, held.byteOffset, held.byteLength);
  const found: Record<string, string> = {};
  for (const match of new TextDecoder("latin1").decode(held).matchAll(/#version (300 es|100)\n/g)) {
    if (match.index < 4) continue;
    const length = view.getUint32(match.index - 4);
    if (length < match[0].length || match.index + length > held.length) continue;
    found[match[1]!] ??= new TextDecoder().decode(held.subarray(match.index, match.index + length));
  }
  return found["300 es"] ?? found["100"] ?? null;
}
