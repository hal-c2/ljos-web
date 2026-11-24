// What the files in Ljós's API read of the script beside it (docs/DIALECT.md §5.1, ts-boundary).
// The shells' sources as shell-sources.json holds them, for a decoder to narrow.
export declare function sources(base: string): Promise<unknown>;
export declare function editorHeld(name: string): void;
// What a compile of the reader's edit answers, for a decoder to narrow.
export declare function checked(file: string, text: string): Promise<unknown>;
