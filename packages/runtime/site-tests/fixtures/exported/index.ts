// A native module ported to TypeScript: what it exports to a page, and the
// types it exports as well, which a page never sees.
export type Alias = number;
export interface Shape {
  width: number;
}
export declare const declared: number;
export type * from "./types.ts";
export { type Shape as Named, Value };
export * from "./more.ts";

const Value = 1;
export const value = Value;
export function make(): Shape {
  return { width: value };
}
