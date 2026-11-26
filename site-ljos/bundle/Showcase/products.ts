// What Showcase/products.json says of a capture of an app, as
// Site/ShowcaseCapture.qml reads it.
export interface Capture {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly shows: string;
  readonly about: string;
}

// A link an app's entry gives: its words and where it goes.
export interface Link {
  readonly label: string;
  readonly href: string;
}

// A recording of an app running: its file's name and shape, and what a
// reader who cannot see it is told it shows.
export interface Recording {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

// A few lines of the engine's example, as the build cut and coloured
// them (scripts/build.mjs's withEngine), as Site/ShowcaseEngine.qml reads
// them.
export interface Snippet {
  readonly says: string;
  readonly code: string;
  readonly rich: string;
  readonly link: string;
  readonly href: string;
}

// The engine's example: what it is, where it stands, its lines and a
// capture of it running.
export interface Example {
  readonly about: string;
  readonly path: string;
  readonly snippets: readonly Snippet[];
  readonly capture: Capture;
}

// The engine an app is built on, where its entry names one.
export interface Engine {
  readonly heading: string;
  readonly line: string;
  readonly label: string;
  readonly href: string;
  readonly example: Example;
}

// One app built with Ljós, as Showcase/products.json has it once the
// build has given its engine's example its lines, as
// Site/ShowcaseApp.qml reads it.
export interface Product {
  readonly name: string;
  readonly what: string;
  readonly maker: string;
  readonly claim: string;
  readonly body: readonly string[];
  readonly recording: Recording;
  readonly captures: readonly Capture[];
  readonly note: string;
  readonly source: Link;
  readonly repo: Link;
  readonly engine?: Engine;
}
