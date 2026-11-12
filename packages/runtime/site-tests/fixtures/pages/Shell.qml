import QtQuick

// One shell, more than one page: which page it shows is the `route`
// the build prerenders it for and the page's script hydrates it with.
// Each page's own words must be in its own HTML, and neither page may
// carry the other's.
Column {
    id: page
    property string route: "/"

    Text { text: "Site shell"; font.pixelSize: 20; font.bold: true }
    Text { text: page.route === "/docs/" ? "Docs page words" : "Home page words" }
    Text { text: "Route " + page.route }
}
