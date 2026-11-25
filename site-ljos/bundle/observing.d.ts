// What the files in Ljós's API read of the script beside it (docs/DIALECT.md §5.1, ts-boundary).
export declare function keyFor(what: string): string;
export declare function isShown(key: string): boolean;
// `target` is the app the Observer looks at, `logs` what it was heard
// saying (observed.js's `logSource`), if anything was.
export declare function open(key: string, target: unknown, logs: unknown, title: string): void;
export declare function toggle(key: string, target: unknown, logs: unknown, title: string): void;
export declare function retarget(key: string, target: unknown): void;
export declare function close(key?: string): void;
export declare function watch(fn: () => void): void;
export declare function unwatch(fn: () => void): void;
export declare function prefetch(): Promise<unknown>;
export declare function prefetchWhenIdle(): void;
export declare function panel(): Promise<unknown>;
