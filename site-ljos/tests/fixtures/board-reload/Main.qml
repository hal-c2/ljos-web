import QtQuick
import Ljos.Blocks
import Site
import "boards.js" as Boards

Item {
    id: page
    width: 700
    height: 900

    property bool seeded: false
    // How many times the loader put a card in: an edit that only set a
    // property would leave this as it was.
    property int made: 0
    property string said: "first"

    function edit(version) {
        said = "loading";
        Boards.use(version);
        stage.reload().then(function (why) {
            page.said = why === "" ? "running " + version : "kept: " + why;
        });
    }

    Row {
        id: edits
        StageButton {
            text: "Edit to the board"
            onPressed: page.edit("after")
        }
        StageButton {
            text: "Edit that fails"
            onPressed: page.edit("broken")
        }
    }
    Text {
        y: edits.height
        text: `${page.said}, made ${page.made}`
    }
    ShellLoader {
        id: stage
        y: 80
        width: 660
        source: Boards.current
        onItemChanged: {
            if (!item)
                return;
            page.made += 1;
            // Given once. What a later card holds, the reload carried.
            if (page.seeded)
                return;
            page.seeded = true;
            item.heading = "North district dispatch";
            item.tickets = [
                { key: "BG-412", title: "Transformer fan", state: "Open", crew: "Katrín S." },
                { key: "BG-415", title: "Feeder 12 voltage sag log", state: "Open", crew: "" },
                { key: "BG-421", title: "Harbour pump meter check", state: "Open", crew: "" }
            ];
        }
    }
}
