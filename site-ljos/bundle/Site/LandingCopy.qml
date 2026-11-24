pragma Singleton
import Ljos.Ui
import Ljos.Core

// The words of the front page's first two sections, in one place, read
// in this order. Each string is t``, so a translation finds it here too.
Object {
    // The hero.
    readonly property string headline: t`Software you can reshape while it runs.`
    readonly property string subhead: t`Ljós is a Rust UI toolkit for apps that people and their agents can change live, with declarative interfaces and typed TypeScript.`
    readonly property string start: t`Get started`
    readonly property string tryDemo: t`Try a demo`
    readonly property string heroWhat: t`the agent replay`
    readonly property string heroNote: t`Replay · no live agent`
    readonly property string heroCaption: t`An agent turns a list into a board while the app runs; then it’s your turn.`

    // Built for agents.
    readonly property string agenticEyebrow: t`Built for agents`
    readonly property string agenticHeadline: t`Your agent can use the app, too.`
    readonly property string agenticBody: t`It can read what’s on screen, press buttons, type, and check that its changes worked. You choose what it’s allowed to do. <a href="/start/mcp/">Connect an agent</a>.`
}
