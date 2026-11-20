import QtQuick
import Site
import Ljos.Core

// Every page of the site as a tree, the one shown the strong one: the
// front page, the demos and each one, then the docs in their sections
// (Router.tree). A workbench's files and a desktop's sidebar.
Flickable {
    id: tree

    property var router: null

    width: parent ? parent.width : 0
    height: parent ? parent.height : 0
    acceptedButtons: Qt.NoButton
    contentWidth: width
    contentHeight: map.implicitHeight + 2 * Theme.l
    clip: true
    Accessible.role: Accessible.ComplementaryContent
    Accessible.name: t`Pages`

    DocsMap {
        id: map
        x: Theme.m
        y: Theme.m
        width: tree.width - 2 * Theme.m
        route: tree.router ? tree.router.route : "/"
        sections: tree.router ? tree.router.tree : []
    }
}
