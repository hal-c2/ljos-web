// The names of Ljos.Core and Ljos.Ui as a file of Ljós's API writes them,
// compiled by qmlc: no `Qt`, and each name from its module.
import Ljos.Ui
import Ljos.Core

Item {
    id: root
    width: 200
    height: 100
    property int base: 3
    property int twice: 0
    property string called: ""
    readonly property string dark: `${Color.of(rgba(0.8, 0.4, 0.2, 1)).darker(2)}`
    readonly property bool same: Color.of("red").equals("#ff0000")
    readonly property int px: Font.of({ family: "Sans", pixelSize: 20 }).pixelSize
    readonly property int corner: Align.Left | Align.Top
    readonly property int button: MouseButton.Left
    readonly property real across: point(3, 4).x + size(5, 6).height
    readonly property string german: Locale.named("de_DE").name
    readonly property bool named: App.name.length >= 0

    Component.onCompleted: {
        twice = bind(() => base * 2);
        later(() => (root.called = "later"));
    }
}
