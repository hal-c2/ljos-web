pragma Singleton
// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick

// The words of the front page's first two sections, in one place, read
// in this order. Each string is t``, so a translation finds it here too.
QtObject {
    // The hero.
    readonly property string headline: t`Software you can reshape while it runs.`
    readonly property string subhead: t`Ljós is a Rust UI toolkit for apps that people and their agents can change live, with declarative interfaces and typed TypeScript.`
    readonly property string start: t`Get started`
    readonly property string tryDemo: t`Try a demo`
    readonly property string heroWhat: t`the agent replay`
    readonly property string heroCaption: t`In this recorded replay, an agent turns a running app’s list into a board. No live agent is running. You can switch the layout yourself, too.`

    // Built for agents.
    readonly property string agenticEyebrow: t`Built for agents`
    readonly property string agenticHeadline: t`Your agent can use the app, too.`
    readonly property string agenticBody: t`Over MCP, it can read what’s on screen, press buttons, type, and check that its changes worked. You choose what it’s allowed to do. <a href="/start/mcp/">Connect an agent</a>.`
    readonly property string agenticDescription: t`A recorded replay of an agent at work in a made-up dispatch app. It turns the list into a board while the app runs, filters it, assigns a crew and checks the result. The app’s TypeScript and the agent’s log are beside it.`
}
