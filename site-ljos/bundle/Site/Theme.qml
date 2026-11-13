pragma Singleton
import QtQuick
import QtCore
import "../scheme.js" as Scheme
import "../tokens.js" as Tokens

// The site's design system, in one place: colour roles, type, spacing,
// shape and motion. Every page, demo frame and the code theme read it
// from here. The colours are tokens.js's, which the build also writes
// into each page's head for the HTML around the app; tests/design.spec.js
// holds every text/background pair to WCAG AA in both schemes.
//
// Light and dark are the reader's: the browser's
// prefers-color-scheme, until they pick one in the header, which is
// kept (Settings, `ljos-web:ljos.dev/scheme`) and said on the page's
// root before the body is read, so the page is first painted in it.
QtObject {
    id: theme

    // "light", "dark", or "" for the browser's own.
    readonly property Settings kept: Settings {
        category: "ljos.dev"
        property string scheme: ""
    }
    readonly property bool dark: kept.scheme === "dark" || (kept.scheme !== "light" && Application.styleHints.colorScheme === Qt.ColorScheme.Dark)

    function toggle() {
        var next = dark ? "light" : "dark";
        kept.scheme = next;
        Scheme.mark(next, next === "dark" ? Tokens.dark.canvas : Tokens.light.canvas);
    }

    // Reduced motion reduces movement: what slides or grows only fades,
    // and what fades still fades.
    readonly property bool calm: Application.styleHints.accessibility.motionPreference === Qt.MotionPreference.ReducedMotion

    // Colour roles: the scheme's own, from the one table both the
    // pages and the page's head read (tokens.js).
    readonly property var tone: dark ? Tokens.dark : Tokens.light
    readonly property color canvas: tone.canvas
    readonly property color surface: tone.surface
    readonly property color surfaceRaised: tone.surfaceRaised
    readonly property color surfaceHover: tone.surfaceHover
    readonly property color surfacePressed: tone.surfacePressed
    readonly property color surfaceSelected: tone.surfaceSelected
    // A control's edge (3:1 against what it stands on).
    readonly property color border: tone.border
    // A hairline between regions, which carries no meaning of its own.
    readonly property color divider: tone.divider
    readonly property color borderStrong: tone.border
    readonly property color focusRing: tone.focus
    readonly property color accent: tone.accent
    readonly property color accentHover: tone.accentHover
    readonly property color accentPressed: tone.accentPressed
    readonly property color textOnAccent: tone.textOnAccent
    readonly property color text: tone.text
    readonly property color textMuted: tone.textMuted
    readonly property color link: tone.link
    // Danger as text: the role's own red is 4.3:1 on the light canvas,
    // so words in it are a step darker there.
    readonly property color danger: tone.danger
    readonly property color scrim: tone.scrim

    // The code theme, for what the site draws around highlighted code
    // (the highlighting itself is the page's HTML, coloured by class).
    readonly property color codeBg: tone.code.bg
    readonly property color codeFg: tone.code.fg
    readonly property color codeGutter: tone.code.gutter

    // Older names, kept for the demos that read them.
    readonly property color bg: canvas
    readonly property color panel: surface
    readonly property color ink: text
    readonly property color muted: textMuted
    readonly property color onAccent: textOnAccent

    // Type. A 16 px body; each step up about a fifth, rounded to lines
    // of a 4 px grid, so a block of text lands on the grid whatever its
    // size.
    readonly property string sans: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Helvetica Neue, Arial, sans-serif"
    readonly property string mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, DejaVu Sans Mono, Liberation Mono, monospace"
    readonly property string serif: sans
    readonly property int captionSize: 13
    readonly property int captionLine: 20
    readonly property int bodySize: 16
    readonly property int bodyLine: 24
    readonly property int subtitleSize: 19
    readonly property int subtitleLine: 28
    readonly property int titleSize: 23
    readonly property int titleLine: 28
    readonly property int headlineSize: 28
    readonly property int headlineLine: 36
    readonly property int displaySize: 40
    readonly property int displayLine: 48
    readonly property int compactDisplaySize: 32
    readonly property int compactDisplayLine: 40
    // The landing page's one big line.
    readonly property int heroSize: 56
    readonly property int heroLine: 64
    readonly property int compactHeroSize: 36
    readonly property int compactHeroLine: 44
    readonly property int codeSize: 14
    readonly property int codeLine: 20

    // Space, on a 4 px grid.
    readonly property int xxs: 4
    readonly property int xs: 8
    readonly property int s: 12
    readonly property int m: 16
    readonly property int l: 24
    readonly property int xl: 32
    readonly property int xxl: 48
    readonly property int xxxl: 64

    // Shape.
    readonly property int radiusSmall: 6
    readonly property int radius: 10
    readonly property int radiusLarge: 16

    // Layout: the reading column, the wide layout's side columns, and
    // where the wide layout starts.
    readonly property int measure: 720
    readonly property int pageWidth: 1040
    readonly property int gutterCompact: 20
    readonly property int gutterWide: 32
    readonly property int tocFrom: 1200
    readonly property int sidebarWidth: 264
    readonly property int tocWidth: 224
    readonly property int headerHeight: 64
    readonly property int wideFrom: 1000

    // Motion, in ms, with its easing (out: fast, then settling).
    readonly property int enterSmall: 150
    readonly property int enterPanel: 250
    readonly property int moveSmall: 150
    readonly property int exitSmall: 100
    readonly property var easeOut: [0.23, 1, 0.32, 1, 1, 1]
    // How far something entering travels: none for a reader who asked
    // for less movement, who still sees it fade.
    readonly property int travel: calm ? 0 : 8
}
