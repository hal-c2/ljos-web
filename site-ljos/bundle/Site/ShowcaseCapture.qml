import Ljos.Ui
import Ljos.Layout
import Site
import "../nav.js" as Nav
import "../Showcase/media.js" as Media
import "../Showcase/products.ts" as Products

// A capture of an app built with Ljós (Showcase/products.json): the
// picture at its own shape, what it shows, and what that says about
// Ljós. The picture is in the page as written and fetched as it nears
// the view, sized from the first paint so nothing moves when it comes.
Column {
    id: card

    required property Products.Capture capture
    property string route: "/showcase/"

    spacing: Theme.s

    Rectangle {
        width: parent.width
        height: Math.round((width - 2) * card.capture.height / card.capture.width) + 2
        radius: Theme.radius
        fill: Theme.surface
        border.color: Theme.divider
        border.width: 1
        clip: true

        Text {
            x: 1
            y: 1
            width: parent.width - 2
            height: parent.height - 2
            format: Text.RichText
            text: Media.pictureSet(card.route, "/showcase/media/" + card.capture.name, width, height, card.capture.alt, false)
        }
    }
    Text {
        width: parent.width
        text: card.capture.shows
        color: Theme.text
        font.family: Theme.sans
        font.size: Theme.bodySize
        font.weight: Font.DemiBold
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.bodyLine
        wrap: Text.Wrap
    }
    Text {
        width: parent.width
        text: card.capture.about
        color: Theme.textMuted
        font.family: Theme.sans
        font.size: Theme.captionSize + 1
        lineHeightMode: Text.FixedHeight
        lineHeight: Theme.captionLine + 2
        wrap: Text.Wrap
    }
}
