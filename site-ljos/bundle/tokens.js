.pragma library
// The site's colours, in one place, for both schemes. Site/Theme.qml
// gives them to every page as colour roles; the build writes them into
// each page's head as CSS custom properties (`--ljos-<role>`, and
// `--ljos-code-<tag>` for highlighted code), for the HTML around the
// app; tests/design.spec.js holds every pair that is read together to
// WCAG AA in both schemes. Seeded at hue 60 (`ljos design export
// --seed 60`): a warm neutral ground and an amber accent.
//
// A role's name here is its CSS name: `textMuted` is
// `--ljos-text-muted`; a `code` entry `typeName` is
// `--ljos-code-typeName`, the tag the code blocks' `.tok-typeName`
// class names.
var light = {
    canvas: "#f9f9f8",
    surface: "#fdfdfc",
    surfaceRaised: "#ffffff",
    surfaceHover: "#ecebe9",
    surfacePressed: "#e5e2e0",
    surfaceSelected: "#fde7d5",
    border: "#93908d",
    divider: "#e5e2e0",
    focus: "#bb6802",
    accent: "#b16200",
    accentHover: "#9c5600",
    accentPressed: "#884a00",
    textOnAccent: "#ffffff",
    text: "#282624",
    textMuted: "#655f5b",
    link: "#8e4e00",
    danger: "#b3261e",
    scrim: "#52000000",
    code: {
        bg: "#f5f4f2",
        fg: "#282624",
        selection: "#fbd9b8",
        gutter: "#6f6964",
        "diagnostic-error": "#b23c37",
        "diagnostic-warning": "#876000",
        keyword: "#9c2e8a",
        string: "#3d7a12",
        number: "#b04a00",
        bool: "#b04a00",
        null: "#b04a00",
        regexp: "#b1245a",
        comment: "#6b6661",
        typeName: "#1a6aa8",
        propertyName: "#0d7377",
        variableName: "#282624",
        function: "#3456c4",
        operator: "#5a5551",
        punctuation: "#5a5551",
        meta: "#8a5a00",
        invalid: "#b3261e",
        topic: "#a34800"
    }
};

var dark = {
    canvas: "#0c0c0c",
    surface: "#131312",
    surfaceRaised: "#1c1c1b",
    surfaceHover: "#242221",
    surfacePressed: "#2b2a28",
    surfaceSelected: "#2f1f12",
    border: "#6a6764",
    divider: "#2b2a28",
    focus: "#d07a14",
    accent: "#b16200",
    accentHover: "#9c5600",
    accentPressed: "#884a00",
    textOnAccent: "#ffffff",
    text: "#efece9",
    textMuted: "#bfb9b4",
    link: "#f3a767",
    danger: "#ff7b72",
    scrim: "#99000000",
    code: {
        bg: "#161514",
        fg: "#efece9",
        selection: "#4a3620",
        gutter: "#8a8580",
        "diagnostic-error": "#ff7b72",
        "diagnostic-warning": "#e3b341",
        keyword: "#df9be8",
        string: "#a6d189",
        number: "#f5a97f",
        bool: "#f5a97f",
        null: "#f5a97f",
        regexp: "#f28fad",
        comment: "#9a948f",
        typeName: "#7fb8f0",
        propertyName: "#6fd0c8",
        variableName: "#efece9",
        function: "#8fa8ff",
        operator: "#c8c2bc",
        punctuation: "#b5afa9",
        meta: "#e0b45c",
        invalid: "#ff8a80",
        topic: "#f3a767"
    }
};
