// What the Cyberpunk shell (Shells/Cyberpunk.qml) reads of its `site`
// beyond what every shell does (shell-site.ts): the router's kinds of
// route and the page's headings, the theme's second colour and links, how
// far the page has scrolled and how wide the Observer is docked.

import type { Router, Site, Theme } from "./shell-site.ts"

export type PunkRouter = Router & {
    readonly demosRoute: boolean
    readonly showcaseRoute: boolean
    readonly reviewRoute: boolean
    // Only how many there are is read here.
    readonly headings: readonly unknown[]
}

export type PunkTheme = Theme & {
    readonly accent2: string
    readonly link: string
}

export type PunkSite = Site & {
    readonly router: PunkRouter
    readonly theme: PunkTheme
    readonly pageOffset: number
    readonly docked: number
}

// Each is missing until the site is had.
export type MaybePunkRouter = PunkRouter | undefined
export type MaybePunkTheme = PunkTheme | undefined

// A channel of the rail.
export interface Channel {
    readonly label: string
    readonly to: string
    readonly current: boolean
}

// Whether a value is had: an object property of a QML file that was given
// nothing reads as null at run time, though its type says undefined, so
// both are missing here.
export function given<T extends object>(value: T | undefined): value is T {
    return typeof value === "object" && value !== null
}
