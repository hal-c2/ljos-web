import QtQuick
import Site
import Ljos.Core
import "later.js" as Later

// The language the site is read in: a button with a globe and the
// language's short name, and a popover with every language the site has,
// each named as it names itself. Picking one changes the page's language
// at once, where the reader is (Site/Preferences.qml `setLanguage`), and it
// is kept for the next page. The popover is drawn with Ljós's own controls
// and comes the first time the button is pressed (Site/LanguageChoices.qml),
// so no page's first load carries it.
Rectangle {
    id: switcher

    property var preferences: null
    // What the switcher stands on, which it is filled with at rest.
    property color ground: "transparent"
    // About to show the choices, drawn in Ljós's own controls.
    signal choosing

    readonly property string language: preferences ? preferences.language : "en"
    readonly property bool opened: choices.item ? choices.item.opened : false

    // Whether the choices were last asked for by keys, so the one shown
    // takes the keyboard when they open.
    property bool byKeys: false

    function toggle(keys) {
        byKeys = keys === true;
        if (choices.item) {
            choices.item.toggle(byKeys);
        } else if (choices.status === Loader.Error) {
            choices.setSource(Later.languageChoices);
        } else {
            switcher.choosing();
            choices.active = true;
        }
    }

    implicitWidth: row.implicitWidth + 2 * Theme.xs
    implicitHeight: Theme.target
    width: implicitWidth
    height: implicitHeight
    radius: Theme.radiusSmall
    color: hit.pressed ? Theme.surfacePressed : hit.containsMouse || switcher.opened ? Theme.surfaceHover : ground
    border.width: activeFocus ? 2 : 0
    border.color: Theme.focusRing

    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    // The language's own name, so a reader who does not read the one
    // shown still hears theirs among the choices; "Language" in the
    // language shown, so one who does hears what the button is for.
    Accessible.name: t`Language: ${preferences ? preferences.languageName : "English"}`
    Accessible.onPressAction: () => switcher.toggle(true)
    Keys.onPressed: (event) => {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            switcher.toggle(true);
            event.accepted = true;
        }
    }

    Row {
        id: row
        anchors.centerIn: parent
        spacing: Theme.xxs + 2
        Accessible.ignored: true

        // A globe: a ring, its meridian and its equator.
        Item {
            anchors.verticalCenter: parent.verticalCenter
            width: 18
            height: 18

            Rectangle {
                anchors.fill: parent
                radius: 9
                color: "transparent"
                border.width: 2
                border.color: Theme.text
            }
            Rectangle {
                anchors.centerIn: parent
                width: 8
                height: 18
                radius: 4
                color: "transparent"
                border.width: 2
                border.color: Theme.text
            }
            Rectangle {
                anchors.centerIn: parent
                width: 18
                height: 2
                color: Theme.text
            }
        }
        // The language's short name, as its tag starts: EN, AR, ZH.
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: switcher.language.split("-")[0].toUpperCase()
            color: Theme.text
            font.family: Theme.sans
            font.pixelSize: Theme.captionSize
            font.weight: Font.DemiBold
        }
    }

    Loader {
        id: choices
        anchors.fill: parent
        active: false
        source: Later.languageChoices
        onLoaded: {
            item.preferences = Qt.binding(() => switcher.preferences);
            item.leftByKeys.connect(() => switcher.forceActiveFocus());
            item.toggle(switcher.byKeys);
        }
    }
    MouseArea {
        id: hit
        anchors.fill: parent
        hoverEnabled: true
        Accessible.ignored: true
        cursorShape: Qt.PointingHandCursor
        onClicked: switcher.toggle()
    }
}
