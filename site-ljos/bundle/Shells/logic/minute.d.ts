// What the files in Ljós's API read of the script beside it (docs/DIALECT.md §5.1, ts-boundary).
export interface Minute {
    readonly clock: string;
    readonly wait: number;
}
export declare function now(): Minute;
