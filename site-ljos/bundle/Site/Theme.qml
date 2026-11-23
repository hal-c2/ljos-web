pragma Singleton
import QtQuick
import "../motion.js" as Motion
import "../scheme.js" as Scheme
import "../tokens.js" as Tokens

// The site's design system, in one place: colour roles, type, spacing,
// shape and motion. Every page, demo frame and the code theme read it
// from here, and never which shell frames them: each shell has a look
// of its own (tokens.js `looks`), and the roles here are the look of
// the shell shown, so a page dresses itself in whichever frames it. The
// colours are tokens.js's, which the build also writes into each page's
// head for the HTML around the app; tests/design.spec.js holds every
// text/background pair to WCAG AA in every shell and both schemes.
//
// Light and dark are the reader's: the browser's
// prefers-color-scheme, until they pick one in the header, which is
// kept (scheme.js, under the one key the head's script reads) and said
// on the page's root before the body is read, so the page is first
// painted in it.
QtObject {
    id: theme

    // "light", "dark", or "" for the browser's own.
    property string picked: Scheme.picked()
    readonly property bool dark: picked === "dark" || (picked !== "light" && Application.styleHints.colorScheme === Qt.ColorScheme.Dark)

    function toggle() {
        var next = dark ? "light" : "dark";
        picked = next;
        Scheme.keep(next);
        Scheme.mark(next, next === "dark" ? look.dark.canvas : look.light.canvas);
    }

    // "light", "dark", or "" to follow the browser again.
    function pick(scheme) {
        picked = scheme;
        Scheme.keep(scheme);
        if (scheme === "")
            Scheme.unmark(look.light.canvas, look.dark.canvas);
        else
            Scheme.mark(scheme, scheme === "dark" ? look.dark.canvas : look.light.canvas);
    }

    // Reduced motion reduces movement: what slides or grows only fades,
    // and what fades still fades; a demo moves slower and softer, never
    // stops. It is the browser's prefers-reduced-motion until the reader
    // says otherwise for this site in the header, which is kept.
    readonly property bool systemCalm: Application.styleHints.accessibility.motionPreference === Qt.MotionPreference.ReducedMotion
    // "calm", "full", or "" for the browser's own (motion.js).
    property string motion: Motion.picked()
    readonly property bool calm: motion === "calm" || (motion !== "full" && systemCalm)

    function setCalm(wanted) {
        // Kept even where it agrees with the browser now: the reader chose
        // it for this site, and a browser that changes its preference
        // later does not change the site back under them.
        motion = wanted ? "calm" : "full";
        Motion.keep(motion);
        Motion.mark(motion);
    }
    Component.onCompleted: Motion.mark(motion)

    // The shell shown, by name (Main.qml says it as it changes), and its
    // look; a shell the reader wrote, which names no look, wears the
    // default one, Elegant, which is what every page is written in.
    property string shell: "elegant"
    readonly property string lookName: Tokens.looks[shell] ? shell : "elegant"
    readonly property var look: Tokens.looks[lookName]

    // Colour roles: the scheme's own in the shell's look, from the one
    // table both the pages and the page's head read (tokens.js).
    readonly property var tone: dark ? look.dark : look.light
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
    readonly property color stage: tone.stage
    readonly property color stageEdge: tone.stageEdge
    readonly property color stageShadow: tone.stageShadow
    readonly property color paper: tone.paper
    // A second colour, for a second series, a tag or a tab's mark, and
    // that colour as words; and a third, which only Cyberpunk has.
    readonly property color accent2: tone.accent2
    readonly property color accent2Text: tone.accent2Text
    readonly property color accent3: tone.accent3
    // What lifts a panel off the page: a long soft shadow in the light,
    // a faint glow in the dark (each transparent where a look has none).
    readonly property color glow: tone.glow
    // The hero's wash behind its live app, from one colour to the other.
    readonly property color washStart: tone.washStart
    readonly property color washEnd: tone.washEnd
    readonly property color shadow: tone.shadow
    readonly property color onCanvasStrong: tone.onCanvasStrong

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

    // Type, the look's: a display family for the big lines (hero and
    // display), a sans for the rest and a mono for code, each the site's
    // own face first (bundle/assets/fonts) and the system's after it.
    // Each step is a size and the line it sits on.
    readonly property var type: look.type
    readonly property string display: look.fonts.display
    readonly property int displayWeight: look.fonts.displayWeight
    // Letter spacing at the hero's size, in pixels; a smaller step is
    // spaced in proportion (Site/Heading.qml).
    readonly property real displayTracking: look.fonts.displayTracking
    readonly property bool displayUpper: look.fonts.displayUpper
    readonly property string sans: look.fonts.sans
    readonly property string mono: look.fonts.mono
    readonly property string serif: display
    readonly property int captionSize: type.caption[0]
    readonly property int captionLine: type.caption[1]
    // The shell's own labels: its menus, tabs and status.
    readonly property int uiSize: type.ui[0]
    readonly property int uiLine: type.ui[1]
    readonly property int bodySize: type.body[0]
    readonly property int bodyLine: type.body[1]
    readonly property int subtitleSize: type.subtitle[0]
    readonly property int subtitleLine: type.subtitle[1]
    readonly property int titleSize: type.title[0]
    readonly property int titleLine: type.title[1]
    readonly property int headlineSize: type.headline[0]
    readonly property int headlineLine: type.headline[1]
    readonly property int displaySize: type.display[0]
    readonly property int displayLine: type.display[1]
    readonly property int compactDisplaySize: type.compactDisplay[0]
    readonly property int compactDisplayLine: type.compactDisplay[1]
    // The landing page's one big line.
    readonly property int heroSize: type.hero[0]
    readonly property int heroLine: type.hero[1]
    readonly property int compactHeroSize: type.compactHero[0]
    readonly property int compactHeroLine: type.compactHero[1]
    readonly property int codeSize: type.code[0]
    readonly property int codeLine: type.code[1]

    // Space, on a 4 px grid.
    readonly property int xxs: 4
    readonly property int xs: 8
    readonly property int s: 12
    readonly property int m: 16
    readonly property int l: 24
    readonly property int xl: 32
    readonly property int xxl: 48
    readonly property int xxxl: 64

    // Shape, the look's: its corners, whether a panel wears corner
    // brackets instead of a box (Site/Panel.qml), and how far its shadow
    // falls.
    readonly property int radiusSmall: look.shape.radiusSmall
    readonly property int radius: look.shape.radius
    readonly property int radiusLarge: look.shape.radiusLarge
    readonly property bool brackets: look.shape.brackets
    readonly property int shadowBlur: look.shape.shadowBlur
    readonly property int shadowY: look.shape.shadowY

    // Layout: the reading column, the wide layout's side columns, and
    // where the wide layout starts.
    readonly property int measure: 720
    readonly property int pageWidth: 1040
    // The widest a page's grid grows in a shell that gives it the whole
    // window (Elegant), its columns and the gap between them.
    readonly property int contentWidest: 1280
    readonly property int columns: 12
    readonly property int columnGap: 24
    readonly property int compactColumnGap: 16
    readonly property int gutterCompact: 20
    readonly property int gutterWide: 32
    readonly property int tocFrom: 1200
    readonly property int sidebarWidth: 264
    readonly property int tocWidth: 224
    readonly property int headerHeight: 64
    readonly property int wideFrom: 1000
    // Below it a finger does the pressing (Main.qml says when): what
    // is pressed is then 44 high, a row of links as much as a button.
    property bool narrow: false
    readonly property int target: narrow ? 44 : 40
    readonly property int rowLeast: narrow ? target : 0
    // What Ljós's Observer lays its pages out for: its list of pages, an
    // object tree and the values beside it, each value wide enough to edit.
    readonly property int observerWidth: 680
    // The narrowest a page is left beside a docked panel: a phone's
    // width, less its gutters.
    readonly property int pageNarrowest: 320

    // Motion, in ms, with its easing (out: fast, then settling).
    readonly property int enterSmall: 150
    readonly property int enterPanel: 250
    readonly property int moveSmall: 150
    readonly property int exitSmall: 100
    readonly property var easeOut: [0.23, 1, 0.32, 1, 1, 1]
    // How far something entering travels: none for a reader who asked
    // for less movement, who still sees it fade.
    readonly property int travel: calm ? 0 : 8
    // A section of a page rising in the first time it is seen: further
    // and slower than a control, so the page settles rather than snaps;
    // with reduced motion it only fades, as quickly.
    readonly property int enterSection: calm ? enterPanel : 560
    readonly property int riseTravel: calm ? 0 : 28
}
