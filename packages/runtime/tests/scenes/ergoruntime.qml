// A card in Ljós's own API, compiled by qmlc: a Controller that keeps a
// label of its host's width, a Tap that counts, a Task that fetches what
// the city names, and a font and alignment from Ljos.Ui. "/served" is the
// test's server (`page.route`).
import Ljos.Ui
import Ljos.Core
import Ljos.Layout

Item {
    id: root
    width: 360
    height: 200
    property string city: "Oslo"
    property int taps: 0
    property alias card: card
    readonly property string sizeText: sizeLabel.text
    readonly property string weatherText: weatherLabel.text
    readonly property string tapsText: tapsLabel.text
    readonly property real labelWidth: sizeLabel.width

    Rectangle {
        id: card
        anchors.fill: parent
        anchors.margins: 10
        radius: 8
        fill: "#eef3f8"
        border.color: "#8aa4c0"

        Controller {
            id: sizing
            property string said: ""
            onUpdated: sizing.said = `card ${host.width}×${host.height}`
        }
        Tap { onTapped: root.taps = root.taps + 1 }

        Task {
            id: weather
            args: [root.city]
            run: (city: string, signal: AbortSignal) => fetch(`/served/${city}.json`, { signal }).then((reply) => reply.json())
        }

        Column {
            anchors.centerIn: parent
            spacing: 6
            Text {
                id: sizeLabel
                width: 300
                text: sizing.said
                font: Font.of({ family: "Sans", pixelSize: 18 })
                horizontalAlignment: Align.HCenter
            }
            Text {
                id: weatherLabel
                width: 300
                text: weather.status === "done" ? `${root.city}: ${weather.value.sky}` : `${root.city}: ${weather.status}`
                horizontalAlignment: Align.HCenter
            }
            Text {
                id: tapsLabel
                width: 300
                text: `tapped ${root.taps} · ${Locale.current.name}`
                horizontalAlignment: Align.HCenter
            }
        }
    }
}
