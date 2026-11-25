// What the files in Ljós's API read of the script beside it (docs/DIALECT.md §5.1, ts-boundary).
// The desktop's own navigation and reader (host.native.js); undefined in a browser.
export interface Desktop {
    start(shell: unknown, root: string): void;
    go(address: string): void;
    step(by: number): boolean;
    keep(): void;
    read(address: string): Promise<unknown>;
    site(name: string): Promise<unknown>;
    readonly root: string;
    readonly observer: string;
    qml(name: string): string;
    readonly noLive: string;
    readonly noDemo: string;
}
export declare const desktop: Desktop | undefined;
