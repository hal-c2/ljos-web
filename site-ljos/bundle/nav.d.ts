// What the files in Ljós's API read of the script beside it (docs/DIALECT.md §5.1, ts-boundary).
export declare function at(base: string, href: string): string;
export declare function linked(base: string, html: string): string;
export declare function go(address: string): void;
// `colour`, when given, is the link's colour in its style (nav.js says why).
export declare function anchor(address: string, label: string, underline: boolean, colour?: unknown): string;
export declare function escape(text: string): string;
export declare function fromPage(route: string, href: string): string;
export declare function inBrowser(): boolean;
// A capture as rich text: `href` from the site's root, without its extension.
export declare function capture(route: string, href: string, width: number, height: number, alt: string): string;
// The desktop's navigation (desktop.js `navigation`), handed in by Site/DesktopNav.qml.
export declare function useDesktop(made: unknown): void;
