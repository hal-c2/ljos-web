// What the files in Ljós's API read of the script beside it (docs/DIALECT.md §5.1, ts-boundary).
export declare function load(name: string): Promise<unknown>;
// `told` is given what the project names and does not have, "" once the next compile gives it its files.
export declare function compile(name: string, entry: string, edits: Record<string, string>, told?: (text: string) => void): Promise<unknown>;
export declare function app(name: string): unknown;
export declare function needsWasm(): Promise<string>;
export declare function diagnosticsOf(error: unknown, path: string): unknown[];
