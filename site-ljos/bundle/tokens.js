.pragma library
// The site's look, in one place: for each shell its colours in both
// schemes, its fonts, its type steps and its shape. Site/Theme.qml gives
// the look of the shell shown to every page as roles, so a page never
// knows which shell frames it; the build writes each table into the
// page's head as CSS custom properties (`--ljos-<role>`, and
// `--ljos-code-<tag>` for highlighted code), the default shell's under
// `:root` and each other's under `[data-ljos-shell-showing]`, for the
// HTML around the app. tests/design.spec.js holds every pair that is
// read together to WCAG AA, in every shell and both schemes.
//
// A role's name here is its CSS name: `textMuted` is
// `--ljos-text-muted`; a `code` entry `typeName` is
// `--ljos-code-typeName`, the tag the code blocks' `.tok-typeName`
// class names.
//
// `light` and `dark` are Elegant's, the shell every page is written in.
// Its accent is the mark's amber (#f49a06) and its second colour the
// mark's purple (#8260da), each made dark or light enough to be read.
var light = {
    canvas: "#f7f5f0",
    surface: "#fbfaf6",
    surfaceRaised: "#ffffff",
    surfaceHover: "#efebe2",
    surfacePressed: "#e7e2d7",
    surfaceSelected: "#f9e8cc",
    border: "#8c867b",
    divider: "#e4dfd4",
    focus: "#a35c00",
    accent: "#f49a06",
    accentHover: "#e48d00",
    accentPressed: "#d08000",
    textOnAccent: "#1a1917",
    text: "#1a1917",
    textMuted: "#5d5850",
    link: "#8a4b00",
    danger: "#b3261e",
    accent2: "#8260da",
    accent2Text: "#5b3fc0",
    accent3: "#f49a06",
    glow: "#00000000",
    // The hero's wash: a soft field from the mark's purple to its
    // amber behind the live app, none where a look is plain.
    washStart: "#268260da",
    washEnd: "#38f49a06",
    shadow: "#2a1a1917",
    onCanvasStrong: "#1a1917",
    scrim: "#52000000",
    // An example's stage: the backdrop its window stands on, the
    // window's hairline and the shadow that lifts it, as a popup of
    // Ljós's controls is lifted (PopupSurface). The window itself is
    // `paper`: what an app's window shows where the app paints nothing,
    // in the scheme the app runs in, so its own text (dark on light,
    // light on dark, unless it says otherwise) reads on it. The build
    // draws each example's picture on it, once for each scheme
    // (scripts/build.mjs STAGES). A dark window is lighter than its stage, as a raised
    // surface is in the dark.
    stage: "#dcd6ca",
    stageEdge: "#a8a296",
    stageShadow: "#1f000000",
    paper: "#fdfbf6",
    code: {
        bg: "#f1ede4",
        fg: "#1a1917",
        selection: "#f7d9a8",
        gutter: "#6b655c",
        "diagnostic-error": "#b23c37",
        "diagnostic-warning": "#7f5a00",
        keyword: "#7a3fb8",
        string: "#3a7212",
        number: "#a84400",
        bool: "#a84400",
        null: "#a84400",
        regexp: "#a8224f",
        comment: "#69635a",
        typeName: "#16649f",
        propertyName: "#0c6b6f",
        variableName: "#1a1917",
        function: "#3150b8",
        operator: "#57524b",
        punctuation: "#57524b",
        meta: "#805300",
        invalid: "#b3261e",
        topic: "#9a4400"
    }
};

var dark = {
    canvas: "#0e0e10",
    surface: "#16161a",
    surfaceRaised: "#1d1d22",
    surfaceHover: "#24242a",
    surfacePressed: "#2b2b32",
    surfaceSelected: "#33260f",
    border: "#6f6d76",
    divider: "#27272e",
    focus: "#f5a623",
    accent: "#f5a623",
    accentHover: "#f7b54a",
    accentPressed: "#e39614",
    textOnAccent: "#1a1917",
    text: "#f4f1ea",
    textMuted: "#b3afa7",
    link: "#f7b866",
    danger: "#ff7b72",
    accent2: "#a490ff",
    accent2Text: "#b9a9ff",
    accent3: "#f5a623",
    glow: "#1ff5a623",
    washStart: "#478260da",
    washEnd: "#24f5a623",
    shadow: "#66000000",
    onCanvasStrong: "#f6f3ec",
    scrim: "#99000000",
    stage: "#222228",
    stageEdge: "#5c5a63",
    stageShadow: "#80000000",
    paper: "#303037",
    code: {
        bg: "#141418",
        fg: "#f4f1ea",
        selection: "#4a3820",
        gutter: "#8c8880",
        "diagnostic-error": "#ff7b72",
        "diagnostic-warning": "#e3b341",
        keyword: "#c8b4ff",
        string: "#a6d189",
        number: "#f7b866",
        bool: "#f7b866",
        null: "#f7b866",
        regexp: "#f28fad",
        comment: "#9a958d",
        typeName: "#7fb8f0",
        propertyName: "#6fd0c8",
        variableName: "#f4f1ea",
        function: "#9fb2ff",
        operator: "#c8c3bb",
        punctuation: "#b5b0a8",
        meta: "#e8bf6a",
        invalid: "#ff8a80",
        topic: "#f7b866"
    }
};

// Cyberpunk: a HUD at night, neon cyan, magenta and yellow on near
// black; in the light, a daylight HUD on cool grey with the neons made
// dark enough to read.
var cyberpunkDark = {
    canvas: "#05060a",
    surface: "#0a0d14",
    surfaceRaised: "#0f131c",
    surfaceHover: "#141a26",
    surfacePressed: "#1a2130",
    surfaceSelected: "#062a31",
    border: "#2a8794",
    divider: "#15212c",
    focus: "#00f0ff",
    accent: "#00f0ff",
    accentHover: "#5cf6ff",
    accentPressed: "#00c8d6",
    textOnAccent: "#05060a",
    text: "#e4f6f9",
    textMuted: "#8ea6b2",
    link: "#00f0ff",
    danger: "#ff5c77",
    accent2: "#ff2bd6",
    accent2Text: "#ff5ce0",
    accent3: "#e8ff3a",
    glow: "#3300f0ff",
    washStart: "#24ff2bd6",
    washEnd: "#1f00f0ff",
    shadow: "#00000000",
    onCanvasStrong: "#f2fdff",
    scrim: "#b305060a",
    stage: "#141b28",
    stageEdge: "#2a8794",
    stageShadow: "#6600f0ff",
    paper: "#222c3e",
    code: {
        bg: "#070a10",
        fg: "#e4f6f9",
        selection: "#073c46",
        gutter: "#6c8592",
        "diagnostic-error": "#ff5c77",
        "diagnostic-warning": "#e8ff3a",
        keyword: "#ff5ce0",
        string: "#e8ff3a",
        number: "#ffb86b",
        bool: "#ffb86b",
        null: "#ffb86b",
        regexp: "#ff8fb0",
        comment: "#6f8996",
        typeName: "#00f0ff",
        propertyName: "#7df9d1",
        variableName: "#e4f6f9",
        function: "#8fd0ff",
        operator: "#b5c8d1",
        punctuation: "#9db2bd",
        meta: "#e8ff3a",
        invalid: "#ff5c77",
        topic: "#ff5ce0"
    }
};

var cyberpunkLight = {
    canvas: "#e9edf2",
    surface: "#f1f4f7",
    surfaceRaised: "#fbfcfd",
    surfaceHover: "#dde3ea",
    surfacePressed: "#d1d9e2",
    surfaceSelected: "#cdeff2",
    border: "#5c6a78",
    divider: "#c6cfd9",
    focus: "#006c76",
    accent: "#006c76",
    accentHover: "#005a62",
    accentPressed: "#00484f",
    textOnAccent: "#ffffff",
    text: "#0a0f18",
    textMuted: "#44505d",
    link: "#00606a",
    danger: "#b0002b",
    accent2: "#b0008e",
    accent2Text: "#9c007e",
    accent3: "#5b6600",
    glow: "#00000000",
    washStart: "#1ab0008e",
    washEnd: "#1a006c76",
    shadow: "#00000000",
    onCanvasStrong: "#05080e",
    scrim: "#660a0f18",
    stage: "#d0d8e1",
    stageEdge: "#7c8a98",
    stageShadow: "#33006c76",
    paper: "#f8fafc",
    code: {
        bg: "#f3f6f9",
        fg: "#0a0f18",
        selection: "#bfe9ee",
        gutter: "#56626f",
        "diagnostic-error": "#b0002b",
        "diagnostic-warning": "#6b5a00",
        keyword: "#9c007e",
        string: "#4d5a00",
        number: "#a13d00",
        bool: "#a13d00",
        null: "#a13d00",
        regexp: "#a3134a",
        comment: "#56626f",
        typeName: "#005e8a",
        propertyName: "#006c5c",
        variableName: "#0a0f18",
        function: "#2443a8",
        operator: "#3c4855",
        punctuation: "#3c4855",
        meta: "#6b5a00",
        invalid: "#b0002b",
        topic: "#9c007e"
    }
};

// Workbench and Desktop: tools, cooler and flatter than Elegant, with
// its amber for what is picked and pressed.
var toolLight = {
    canvas: "#f3f4f6",
    surface: "#fafafb",
    surfaceRaised: "#ffffff",
    surfaceHover: "#e7e9ed",
    surfacePressed: "#dde0e5",
    surfaceSelected: "#fbe9cf",
    border: "#858a93",
    divider: "#dfe2e7",
    focus: "#a35c00",
    accent: "#f49a06",
    accentHover: "#e48d00",
    accentPressed: "#d08000",
    textOnAccent: "#1a1917",
    text: "#1b1d22",
    textMuted: "#555a63",
    link: "#8a4b00",
    danger: "#b3261e",
    accent2: "#8260da",
    accent2Text: "#5b3fc0",
    accent3: "#f49a06",
    glow: "#00000000",
    washStart: "#00000000",
    washEnd: "#00000000",
    shadow: "#1f1b1d22",
    onCanvasStrong: "#1b1d22",
    scrim: "#52000000",
    stage: "#d5d9df",
    stageEdge: "#9da2ab",
    stageShadow: "#1f000000",
    paper: "#fdfbf6",
    code: {
        bg: "#f6f7f9",
        fg: "#1b1d22",
        selection: "#f7d9a8",
        gutter: "#5f646d",
        "diagnostic-error": "#b23c37",
        "diagnostic-warning": "#7f5a00",
        keyword: "#7a3fb8",
        string: "#3a7212",
        number: "#a84400",
        bool: "#a84400",
        null: "#a84400",
        regexp: "#a8224f",
        comment: "#616670",
        typeName: "#16649f",
        propertyName: "#0c6b6f",
        variableName: "#1b1d22",
        function: "#3150b8",
        operator: "#4f545c",
        punctuation: "#4f545c",
        meta: "#805300",
        invalid: "#b3261e",
        topic: "#9a4400"
    }
};

var toolDark = {
    canvas: "#121317",
    surface: "#181a1f",
    surfaceRaised: "#1f2127",
    surfaceHover: "#262931",
    surfacePressed: "#2d3039",
    surfaceSelected: "#33270f",
    border: "#6c707b",
    divider: "#272a31",
    focus: "#f5a623",
    accent: "#f5a623",
    accentHover: "#f7b54a",
    accentPressed: "#e39614",
    textOnAccent: "#1a1917",
    text: "#e8eaee",
    textMuted: "#a8adb7",
    link: "#f7b866",
    danger: "#ff7b72",
    accent2: "#a490ff",
    accent2Text: "#b9a9ff",
    accent3: "#f5a623",
    glow: "#00000000",
    washStart: "#00000000",
    washEnd: "#00000000",
    shadow: "#66000000",
    onCanvasStrong: "#f2f3f6",
    scrim: "#99000000",
    stage: "#24262d",
    stageEdge: "#5a5e69",
    stageShadow: "#80000000",
    paper: "#33353d",
    code: {
        bg: "#15171b",
        fg: "#e8eaee",
        selection: "#4a3820",
        gutter: "#878c96",
        "diagnostic-error": "#ff7b72",
        "diagnostic-warning": "#e3b341",
        keyword: "#c8b4ff",
        string: "#a6d189",
        number: "#f7b866",
        bool: "#f7b866",
        null: "#f7b866",
        regexp: "#f28fad",
        comment: "#959aa3",
        typeName: "#7fb8f0",
        propertyName: "#6fd0c8",
        variableName: "#e8eaee",
        function: "#9fb2ff",
        operator: "#c3c7ce",
        punctuation: "#b0b4bc",
        meta: "#e8bf6a",
        invalid: "#ff8a80",
        topic: "#f7b866"
    }
};

// The families each shell sets its words in. Each names the site's own
// face (bundle/assets/fonts, declared in the head) first and the
// system's after it, so a face that has not come yet only changes how
// the words look, never what they say.
var systemSans = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
var systemMono = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
var families = {
    sans: "'Inter', " + systemSans,
    mono: "'JetBrains Mono', " + systemMono,
    techno: "'Chakra Petch', 'Inter', " + systemSans
};

// Type steps, each [size, line] in pixels; `hero` and `display` are
// set in the display family, the rest in the sans.
var looks = {
    elegant: {
        light: light,
        dark: dark,
        fonts: { display: families.sans, sans: families.sans, mono: families.mono, displayWeight: 600, displayTracking: -1.2, displayUpper: false },
        type: {
            hero: [56, 64], compactHero: [36, 42], display: [48, 56], compactDisplay: [34, 40],
            headline: [32, 40], title: [23, 30], subtitle: [20, 30], body: [17, 28],
            caption: [13, 20], ui: [14, 20], code: [14, 22]
        },
        shape: { radiusSmall: 8, radius: 12, radiusLarge: 16, brackets: false, shadowBlur: 48, shadowY: 16 }
    },
    cyberpunk: {
        light: cyberpunkLight,
        dark: cyberpunkDark,
        fonts: { display: families.techno, sans: families.techno, mono: families.mono, displayWeight: 600, displayTracking: 0, displayUpper: false },
        type: {
            hero: [60, 64], compactHero: [36, 40], display: [44, 48], compactDisplay: [32, 36],
            headline: [28, 36], title: [21, 28], subtitle: [18, 28], body: [16, 26],
            caption: [13, 20], ui: [13, 18], code: [14, 22]
        },
        shape: { radiusSmall: 0, radius: 2, radiusLarge: 4, brackets: true, shadowBlur: 0, shadowY: 0 },
        // A live device is a mission console: what it is made of, the app
        // and the agent driving it side by side, with no tabs between.
        console: true
    },
    workbench: {
        light: toolLight,
        dark: toolDark,
        fonts: { display: families.sans, sans: families.sans, mono: families.mono, displayWeight: 600, displayTracking: -0.4, displayUpper: false },
        type: {
            hero: [40, 48], compactHero: [32, 40], display: [32, 40], compactDisplay: [28, 36],
            headline: [23, 30], title: [17, 24], subtitle: [15, 22], body: [14, 22],
            caption: [12, 18], ui: [13, 18], code: [13, 20]
        },
        shape: { radiusSmall: 4, radius: 6, radiusLarge: 8, brackets: false, shadowBlur: 0, shadowY: 0 }
    },
    desktop: {
        light: toolLight,
        dark: toolDark,
        fonts: { display: families.sans, sans: families.sans, mono: families.mono, displayWeight: 600, displayTracking: -0.6, displayUpper: false },
        type: {
            hero: [44, 52], compactHero: [32, 40], display: [36, 44], compactDisplay: [28, 36],
            headline: [24, 32], title: [19, 26], subtitle: [17, 26], body: [15, 24],
            caption: [12, 18], ui: [13, 18], code: [13, 20]
        },
        shape: { radiusSmall: 4, radius: 6, radiusLarge: 10, brackets: false, shadowBlur: 24, shadowY: 8 }
    }
};
