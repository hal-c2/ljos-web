// What the files in Ljós's API read of the script beside it (docs/DIALECT.md §5.1, ts-boundary).
// "light", "dark", or "" for the browser's own.
export declare function picked(): string;
export declare function keep(scheme: string): void;
// `tint` is the scheme's canvas, for the address bar.
export declare function mark(scheme: string, tint: string): void;
export declare function unmark(light: string, dark: string): void;
