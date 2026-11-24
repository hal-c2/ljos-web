// What the files in Ljós's API read of the script beside it (docs/DIALECT.md §5.1, ts-boundary).
// On the desktop a module is its file's address; in the browser, its import().
export declare function sourceFor(wanted: () => string): string | (() => Promise<unknown>);
// The board module's address, as a still poster draws it on the desktop.
export declare function boardAt(): string;
