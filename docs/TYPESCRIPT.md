# TypeScript in ljos-web

The runtime (`packages/runtime`) and the hand-written parts of the code
grammar (`packages/lezer-ljos`) are being ported from JavaScript to strict
TypeScript, one area at a time. Until an area is ported its files stay
JavaScript, and TypeScript reads them unchecked (`allowJs`).

## How it runs

There is no build step. The TypeScript is what runs:

- **Vite** strips the types in a page, in `vite dev` and in a site build.
- **Node 24** strips them itself in the CLI (`bin/ljos-web.js`), the server,
  the site builder and the tests. Node does not strip a file under
  `node_modules`, but a workspace package is reached through its link and
  runs from where it is, outside it.
- The package `exports` name the `.ts` files.

So the source is held to what can be erased (`erasableSyntaxOnly`): no
`enum`, `namespace`, parameter properties or `import =`. Write a `const`
object and a union of its values instead of an enum.

A module names another by the file it is, `.ts` included
(`import { findTheme } from "./find-theme.ts"`): Node resolves nothing
else. `tsc` with `rewriteRelativeImportExtensions` rewrites those to `.js`,
so the same source also emits plain ESM (`tsc -p packages/runtime
--noEmit false --outDir dist --declaration`) for whatever cannot strip
types.

## Checking

`pnpm -r --if-present run typecheck` (CI's browser job runs it). The
options shared by every package are in `tsconfig.base.json`: `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax` (a type is imported with `import type`), and the rest.

## Porting an area

1. `git mv` its files from `.js` to `.ts`, and change every import of them
   (other modules, tests, `site.js`'s and `vite.js`'s paths, the package
   `exports`) to `.ts`.
2. Type what the area exports properly: these are the shapes other areas
   and pages build on.
3. Where a value really is not known (a property a page set, a parsed
   JSON), it is `unknown`, narrowed where it is used. Not `any`.
4. Run the area's tests and the push gate.
