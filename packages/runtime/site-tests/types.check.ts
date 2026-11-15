// What a TypeScript caller of the runtime may write, held by
// `pnpm typecheck` (`tsc -p .`): this file is compiled, never run. A
// type that stops allowing one of these lines fails the check here,
// not in the caller's project.
import { Accessible } from "../QtQuick/Accessible.ts";
import { paletteOf } from "../QtQuick/Palette.ts";

// `Accessible.announce` is said of the type, as QML says it.
export const announced: void = Accessible.announce("Saved", Accessible.Polite);

// A window asks for its palette with neither provider, as Window.js does.
export const windowPalette = (self: Parameters<typeof paletteOf>[0]) => paletteOf(self);
