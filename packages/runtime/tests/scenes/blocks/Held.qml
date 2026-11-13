import QtQuick
// The application's own shell, holding a block of its own file: what a
// shell built with the application ships (its files named as a minifier
// left them) and a user's compiled in the page share.
Rectangle { objectName: "default-shell"; width: 40; height: 30; Tally { id: tally; objectName: "tally" } }
