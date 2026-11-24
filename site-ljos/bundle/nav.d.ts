// What the files in Ljós's API read of the script beside it (docs/DIALECT.md §5.1, ts-boundary).
export declare function at(base: string, href: string): string;
export declare function linked(base: string, html: string): string;
export declare function go(address: string): void;
export declare function anchor(address: string, label: string, underline: boolean): string;
export declare function escape(text: string): string;
export declare function fromPage(route: string, href: string): string;
export declare function inBrowser(): boolean;
