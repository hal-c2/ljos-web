// The interface `#kernel` names, which `solid.js` and `wasm.js` both are:
// the types of a module that is still JavaScript, for the TypeScript that
// imports it. TypeScript reads this in place of `solid.js`, the condition
// it resolves `#kernel` by.
import type { Accessor, Owner, Setter } from "solid-js";

// A node of Ljós's graph, by number; nothing on the Solid kernel.
export type Node = number;

export declare const WASM: boolean;

export declare function cell(owner: Owner | null): Node;
export declare function binding(owner: Owner | null, run: () => boolean): Node;
export declare function placed(of: Node): void;
export declare function read(of: Node, owner: Owner | null): void;
export declare function touch(of: Node): void;
export declare function version(owner: Owner | null): [read: () => void, move: () => void];

export declare function followed(): boolean;
export declare function untrack<T>(work: () => T): T;

export declare function signal<T>(
  value: T,
  owner?: Owner | null,
  options?: { equals?: false | ((prev: T, next: T) => boolean) },
): [get: Accessor<T>, set: Setter<T>];

export declare function live(): number;
