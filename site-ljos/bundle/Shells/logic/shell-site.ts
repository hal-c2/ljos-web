// What a shell is given as its `site` (Main.qml): the site's state, and
// what a shell may ask of it. Desktop and Workbench read it through these.

// A page of the docs or the site, as the sidebar lists it.
export interface Page {
    readonly title: string
    readonly route: string
}

// A demo of the site's (Content.pro), with the app it runs.
export interface Demo {
    readonly title: string
    readonly route: string
    readonly app: string
}

// A section of the docs' sidebar (Content.sidebar).
export interface Section {
    readonly label: string
    readonly pages: readonly Page[]
}

// Site/Router.qml.
export interface Router {
    readonly route: string
    readonly title: string
    readonly github: string
    readonly docsRoute: boolean
    readonly demos: readonly Demo[]
    readonly docs: readonly Section[]
    nameOf(to: string): string
    fileOf(to: string): string
    address(to: string): string
    go(to: string): void
}

// A shell the reader may pick (Site/Preferences.qml `shells`).
export interface ShellChoice {
    readonly name: string
    readonly label: string
}

// Site/Preferences.qml.
export interface Preferences {
    readonly wide: boolean
    readonly calm: boolean
    readonly scheme: string
    readonly shown: string
    readonly shells: readonly ShellChoice[]
    setScheme(name: string): void
    setCalm(wanted: boolean): void
    setShell(name: string): void
}

// The site's colours and faces (Site/Theme.qml).
export interface Theme {
    readonly dark: boolean
    readonly canvas: string
    readonly surface: string
    readonly surfaceRaised: string
    readonly surfaceHover: string
    readonly surfacePressed: string
    readonly surfaceSelected: string
    readonly divider: string
    readonly accent: string
    readonly focusRing: string
    readonly text: string
    readonly textMuted: string
    readonly danger: string
    readonly sans: string
    readonly mono: string
}

// What is wrong with the open file, as the Problems panel lists it.
export interface Problem {
    readonly text: string
}

// A call the front page's recorded agent sent (Site/Running.qml).
export interface Call {
    readonly tool: string
    readonly args: string
    readonly said: string
}

// The folders a reader opened or shut, by name.
export type Folded = { readonly [name: string]: boolean }

// What a Workbench's reader has shown and hidden, as the site keeps it.
export interface Arrangement {
    readonly explorerOpen: boolean
    readonly inspectorOpen: boolean
    readonly panelShown: number
    readonly view: number
    readonly folded: Folded
    readonly route: string
}

export interface Site {
    readonly router: Router
    readonly preferences: Preferences
    readonly theme: Theme
    readonly menuOpen: boolean
    readonly opened: readonly string[]
    readonly hydratedIn: number
    readonly alive: number
    readonly renderer: string
    readonly observing: boolean
    readonly problems: readonly Problem[]
    readonly calls: readonly Call[]
    measureRenderer(): void
    showSource(name: string): void
    reload(): void
    observe(): void
    back(): void
    forward(): void
    close(at: number): void
    clearCalls(): void
    keep(name: string, state: Arrangement): void
    kept(name: string): unknown
}

// Each is missing until the site is had.
export type MaybeRouter = Router | undefined
export type MaybePreferences = Preferences | undefined
export type MaybeTheme = Theme | undefined

// `folded` with `folder` opened or shut.
export function folding(folded: Folded, folder: string, open: boolean): Folded {
    const next: { [name: string]: boolean } = { ...folded }
    next[folder] = !open
    return next
}

function isFolded(v: unknown): v is Folded {
    return typeof v === "object" && v !== null
}

// What the site kept for a shell, if it kept anything: it keeps what the
// shell gave it (`keep`), so anything else is nothing kept.
export function arrangementOf(v: unknown): Arrangement | undefined {
    if (typeof v !== "object" || v === null)
        return undefined
    if (!("explorerOpen" in v) || !("inspectorOpen" in v) || !("panelShown" in v) || !("view" in v) || !("folded" in v) || !("route" in v))
        return undefined
    const { explorerOpen, inspectorOpen, panelShown, view, folded, route } = v
    if (typeof explorerOpen !== "boolean" || typeof inspectorOpen !== "boolean" || typeof panelShown !== "number" || typeof view !== "number" || typeof route !== "string" || !isFolded(folded))
        return undefined
    return { explorerOpen, inspectorOpen, panelShown, view, folded, route }
}

// What a Desktop's own parts ask of it. Its menu bar's titles are
// named by their labels.
export interface Desk {
    readonly wide: boolean
    readonly route: string
    readonly router: MaybeRouter
    openTitle: string
    go(to: string): void
    closeMenu(label: string): void
    besideTitle(from: string, step: number): void
}

// What a Workbench's own parts ask of it.
export interface Bench {
    readonly wide: boolean
    readonly router: MaybeRouter
    view: number
}

// A row of Desktop's Go menu.
export interface Shortcut {
    readonly label: string
    readonly to: string
}

// A phone's pane, along the bottom.
export interface Pane {
    readonly label: string
    readonly icon: string
}

// A shell's QML in Workbench's explorer, without its suffix.
export interface ShellFile {
    readonly file: string
    readonly name: string
}
