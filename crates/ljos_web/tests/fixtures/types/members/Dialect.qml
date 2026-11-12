import Ljos.Ui
import Ljos.Layout

Column {
    spacing: 5
    Rectangle {
        width: 100
        height: 50
        fill: "tomato"
        onFillChanged: console.log(fill)
        Tap { onTapped: console.log("tapped") }
    }
    Text {
        text: "Hello"
        font.size: 20
        align: Text.AlignHCenter
        wrap: Text.WordWrap
        format: Text.PlainText
    }
}
