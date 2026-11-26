pragma Scripts: JavaScript; import Ljos.Ui
import Ljos.Layout
import Site
import Ljos.Core
import "code-editor.js" as Editor
import "../shells.js" as Shells
import "../nav.js" as Nav

// The QML the page shown is made from, highlighted as a code block is:
// a workbench's Source panel. The text comes the first time the panel is
// shown (shell-sources.json), so no page loads it for a reader who
// never looks.
Item {
    id: source

    property var router: null
    readonly property string name: !router || router.route === "/" ? "Landing" : router.route === "/demos/" ? "DemosPage" : router.route === "/showcase/" ? "ShowcasePage" : router.pro ? "ProDemoPage" : "DocPage"
    property var all: null
    readonly property var file: all ? all.pages[name] ?? null : null

    width: parent ? parent.width : 0
    height: parent ? parent.height : 0

    function load() {
        if (source.all !== null)
            return;
        Shells.sources(Content.base).then((all) => source.all = all, (why) => console.warn(`PageSource: ${why}`));
    }
    onVisibleChanged: if (visible) load()
    Component.onCompleted: if (visible && Nav.inBrowser()) load()

    Column {
        id: top
        x: Theme.s
        y: Theme.s
        width: parent.width - 2 * Theme.s
        spacing: Theme.xxs

        Text {
            width: parent.width
            text: source.file ? source.file.file : ""
            color: Theme.text
            font.family: Theme.mono
            font.size: Theme.captionSize
            font.weight: Font.DemiBold
            elide: Text.ElideMiddle
        }
        Text {
            width: parent.width
            text: t`The QML this page is made from. The shell around it is its own file: open the shell menu to see it.`
            color: Theme.textMuted
            font.family: Theme.sans
            font.size: Theme.captionSize
            wrap: Text.Wrap
        }
    }
    Flickable {
        x: Theme.s
        y: top.y + top.height + Theme.s
        width: parent.width - 2 * Theme.s
        height: parent.height - y - Theme.s
        contentWidth: code.implicitWidth
        contentHeight: code.implicitHeight
        clip: true

        Text {
            id: code
            color: Theme.codeFg
            font.family: Theme.mono
            font.size: 12
            lineHeightMode: Text.FixedHeight
            lineHeight: 18
            format: Text.RichText
            wrap: Text.NoWrap
            text: source.file ? Editor.shownAs(source.file.rich, source.file.text, source.file.text) : ""
        }
    }
}
