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
    readonly property string heroCaption: t`Press Run to replay an agent filling in this small app, pressing its buttons and checking the result. Then it’s your turn. No live agent is running.`

    // Built for agents.
    readonly property string agenticEyebrow: t`Built for agents`
    readonly property string agenticHeadline: t`Your agent can use the app, too.`
    readonly property string agenticBody: t`It can read what’s on screen, press buttons, type, and check that its changes worked. You choose what it’s allowed to do. <a href="/start/mcp/">Connect an agent</a>.`
    readonly property string agenticDescription: t`A replay of an agent at work in a made-up dispatch app. It adds a heading and tickets, turns on a filter, assigns a crew, and checks the result. A log beside the app shows each step.`
}
