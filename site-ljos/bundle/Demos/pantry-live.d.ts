// What the files in Ljós's API read of the script beside it (docs/DIALECT.md §5.1, ts-boundary).
// The editor's squiggles: what the last compile said of Shell.qml.
export declare function diagnostics(): unknown;
export declare function setProject(files: unknown, text: string): void;
export declare function setShell(text: string): void;
// "" where the compiler can run, else the sentence the demo shows instead.
export declare function needsWasm(): Promise<string>;
// The stage's source: the shell set last, compiled in the page.
export declare function sourceFor(): unknown;
// What a reload of the stage said: "" when it took, else why not.
export declare function whyNot(reloaded: unknown): Promise<string>;
