// What the files in Ljós's API read of the script beside it (docs/DIALECT.md §5.1, ts-boundary).
export declare function sourceFor(wanted: () => string): () => Promise<unknown>;
export declare function reload(shell: unknown, wanted: () => string): Promise<unknown> | unknown;
export declare function still(board: unknown): unknown;
