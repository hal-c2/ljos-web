pragma Singleton
// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick

// The front page's words, in one place: the copy deck is written and
// reviewed apart from the page, and a new deck is a change to this file
// alone. Each string is t``, so a translation finds it here too.
QtObject {
    // The hero.
    readonly property string eyebrow: t`Rust UI toolkit for live, malleable apps`
    readonly property string headline: t`The UI toolkit your users and agents can reshape while it runs.`
    readonly property string subhead: t`Write declarative interfaces with strict TypeScript in a Rust engine that exposes every object, binding, and frame to humans and coding agents while the app is open. Switch layouts, edit code, or inspect live state on this page without leaving it.`
    readonly property string start: t`Start in a minute`
    readonly property string explore: t`Explore demos`
    readonly property string github: t`GitHub`
    readonly property string heroWhat: t`the agent replay`
    readonly property string heroCaption: t`Read the source the card's state amounts to, inspect any live property in the Observer, or step the recorded agent trace while the app keeps running.`

    // 2. Agentic first.
    readonly property string agenticEyebrow: t`Agentic first`
    readonly property string agenticHeadline: t`An agent reads the live tree, checks the code, and drives controls by role.`
    readonly property string agenticBody: t`Ljós ships two Model Context Protocol servers built on the same accessibility and object model: <code>ljos mcp</code> for static checking, linting, formatting, design checks, and structural edits (<code>qml_check</code>, <code>qml_lint</code>, <code>qml_format</code>, <code>qml_edit_apply</code>, <code>type_lookup</code>, <code>blocks_list</code>, <code>design_rules</code>, <code>design_contrast</code>), and <code>ljos run --mcp</code> to inspect and drive a running window (<code>app_snapshot</code>, <code>app_find</code>, <code>app_inspect</code>, <code>app_click</code>, <code>app_type</code>, <code>app_set_property</code>, <code>app_audit</code>, <code>app_reload</code>). Access is loopback-only or <code>0600</code> Unix socket, gated by explicit capabilities (<code>inspect</code>, <code>input</code>, <code>mutate</code>, <code>eval</code>) and a per-process 256-bit bearer token, and off by default in release builds.`
    readonly property string agenticWhat: t`the MCP replay`
    readonly property string agenticBadge: t`Replay of a real MCP session`
    readonly property string agenticCaption: t`Step through this recorded MCP replay to watch each tool call locate a control, inspect its bindings, and update the live app.`
    readonly property string agenticDescription: t`A dispatch window an agent fills over MCP: it sets the heading and tickets, finds a filter and a crew button by role and presses them, then checks the result. Beside it, the agent's log of each call and what the app answered.`
}
