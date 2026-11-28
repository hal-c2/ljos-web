// What the files in Ljós's API read of the script beside it (docs/DIALECT.md §5.1, ts-boundary).
// A module as an import gives it; a JSON file's data has no fixed shape
// until a decoder narrows it (Review.laterOf).
export interface Module {
  readonly default: unknown;
}
export declare function shellChoices(): Promise<unknown>;
export declare function languageChoices(): Promise<unknown>;
export declare function shellSource(): Promise<unknown>;
export declare function controlsLook(): Promise<unknown>;
export declare function landing(): Promise<unknown>;
export declare function showcase(): Promise<unknown>;
export declare function review(): Promise<unknown>;
export declare function reviewLater(): Promise<Module>;
export declare function demosPage(): Promise<unknown>;
export declare function proDemo(): Promise<unknown>;
export declare function liveSource(): Promise<unknown>;
export declare function searchResults(): Promise<unknown>;
