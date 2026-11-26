// The shape of a look in tokens.js: what Theme.qml reads of it. A
// TypeScript module, not only tokens.d.ts, so that Ljós on the desktop
// takes these as a property's type (it refuses a .d.ts beside a .js one
// there). Colours are CSS colour strings.
export interface CodeTone {
    readonly bg: string;
    readonly fg: string;
    readonly gutter: string;
}
export interface Tone {
    readonly canvas: string;
    readonly surface: string;
    readonly surfaceRaised: string;
    readonly surfaceHover: string;
    readonly surfacePressed: string;
    readonly surfaceSelected: string;
    readonly border: string;
    readonly divider: string;
    readonly focus: string;
    readonly accent: string;
    readonly accentHover: string;
    readonly accentPressed: string;
    readonly textOnAccent: string;
    readonly text: string;
    readonly textMuted: string;
    readonly link: string;
    readonly danger: string;
    readonly scrim: string;
    readonly stage: string;
    readonly stageEdge: string;
    readonly stageShadow: string;
    readonly paper: string;
    readonly accent2: string;
    readonly accent2Text: string;
    readonly accent3: string;
    readonly glow: string;
    readonly washStart: string;
    readonly washEnd: string;
    readonly shadow: string;
    readonly onCanvasStrong: string;
    readonly code: CodeTone;
}
export interface Fonts {
    readonly display: string;
    readonly sans: string;
    readonly mono: string;
    readonly displayWeight: number;
    readonly displayTracking: number;
    readonly displayUpper: boolean;
}
// A step of type: its size and its line height, in pixels.
export type Step = readonly [number, number];
export interface TypeSteps {
    readonly hero: Step;
    readonly compactHero: Step;
    readonly display: Step;
    readonly compactDisplay: Step;
    readonly headline: Step;
    readonly title: Step;
    readonly subtitle: Step;
    readonly body: Step;
    readonly caption: Step;
    readonly ui: Step;
    readonly code: Step;
}
export interface Shape {
    readonly radiusSmall: number;
    readonly radius: number;
    readonly radiusLarge: number;
    readonly brackets: boolean;
    readonly shadowBlur: number;
    readonly shadowY: number;
}
export interface Look {
    readonly light: Tone;
    readonly dark: Tone;
    readonly fonts: Fonts;
    readonly type: TypeSteps;
    readonly shape: Shape;
    // A live device is a mission console (tokens.js says what that is).
    readonly console?: boolean;
}
