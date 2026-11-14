// Ljós's one arrangement (DIALECT.md §4.6) case by case: an explicit size,
// filling, a preferred size, a minimum and a maximum, padding, margins,
// alignment and direction, in a Row, a Column, a Box and a Grid. What
// ljos-ui does with the same file is in `fixtures/ljoslayoutrule.json`
// (ljoslayout.spec.js says how it was made). The alignments are numbers
// and the direction is 1 (right to left): the web has no `Align` yet.
import Ljos.Ui
import Ljos.Layout

Item {
    id: root

    // What the spec hides and turns.
    property alias fFillerItem: fFiller
    property alias gBoxItem: gBox
    property alias aaRowItem: aaRow
    property alias abRowItem: abRow
    property alias acAItem: acA
    property alias acHomeItem: acHome
    width: 1000
    height: 2000

    // What every case's children are, for `dump()`: x, y, width, height,
    // and the implicit size.
    readonly property var all: [
        aRow, aA, aB, aC,
        bCol, bT, bF, bCentred,
        cRow, cA, cB, cC,
        dRow, dA, dB, dC,
        eRow, eA, eSkipped, eB,
        fRow, fFiller, fFixed,
        gBox, gDisplay, gPad,
        hRow, hP, hQ,
        iRow, iM, iN,
        jRow, jU, jV,
        kRow, kW, kX,
        lRow, lA, lB,
        mRow, mFill, mOwn, mPref, mCentre, mBottom,
        nCol, nH1, nH2,
        oRow, oA, oB,
        pRow, pA, pB, pLine, pC, pD,
        qGrid, qA, qB, qC, qD, qE,
        rGrid, rA, rB, rC,
        sGrid, sA, sB, sC,
        tGrid, tA, tB, tC,
        uGrid, uA, uB, uC,
        vGrid, vA, vB,
        wRow, wA,
        xCol, xRow, xFill, xFixed,
        yCol, yA,
        zGrid, zA, zB,
        aaRow, aaA, aaB, aaC,
        abRow, abA, abB,
        acRow, acA, acB,
        adGrid, adA, adB
    ]

    function dump() {
        const out = {}
        for (const item of all)
            out[item.objectName] = [item.x, item.y, item.width, item.height, item.implicitWidth, item.implicitHeight]
        return JSON.stringify(out)
    }

    // An explicit width is the request (ljos-box.feature).
    Row {
        id: aRow; objectName: "aRow"; width: 400
        Item { id: aA; objectName: "aA"; implicitWidth: 80; width: 50; height: 20 }
        Item { id: aB; objectName: "aB"; implicitWidth: 30; implicitHeight: 20 }
        Rectangle { id: aC; objectName: "aC"; Layout.fillWidth: true; implicitHeight: 20 }
    }

    // The same down a Column: a child's width is the size it keeps, and
    // its Layout.alignment moves it in the room left.
    Column {
        id: bCol; objectName: "bCol"; y: 40; width: 400; spacing: 5
        Rectangle { id: bT; objectName: "bT"; implicitWidth: 120; width: 300; height: 20 }
        Rectangle { id: bF; objectName: "bF"; Layout.fillWidth: true; implicitHeight: 10 }
        Rectangle { id: bCentred; objectName: "bCentred"; implicitWidth: 120; width: 300; height: 20; Layout.alignment: 4 }
    }

    // A RowLayout's numbers, in a Row with Ljós's spacing given.
    Row {
        id: cRow; objectName: "cRow"; y: 120; width: 400; spacing: 5
        Rectangle { id: cA; objectName: "cA"; implicitWidth: 40; implicitHeight: 30 }
        Rectangle { id: cB; objectName: "cB"; Layout.fillWidth: true; implicitHeight: 30 }
        Rectangle { id: cC; objectName: "cC"; implicitWidth: 60; implicitHeight: 30 }
    }

    // Room shared out is shared in whole pixels.
    Row {
        id: dRow; objectName: "dRow"; y: 160; width: 100
        Rectangle { id: dA; objectName: "dA"; Layout.fillWidth: true; implicitHeight: 10 }
        Rectangle { id: dB; objectName: "dB"; Layout.fillWidth: true; implicitHeight: 10 }
        Rectangle { id: dC; objectName: "dC"; Layout.fillWidth: true; implicitHeight: 10 }
    }

    // Children that only have sizes are packed as a positioner packs them.
    Row {
        id: eRow; objectName: "eRow"; y: 180; width: 400; height: 50; spacing: 4; padding: 3
        Item { id: eA; objectName: "eA"; width: 20.5; height: 10 }
        Item { id: eSkipped; objectName: "eSkipped"; width: 0; height: 10 }
        Item { id: eB; objectName: "eB"; width: 30; height: 40 }
    }

    // Hidden and shown again, a child asks for its own size.
    Row {
        id: fRow; objectName: "fRow"; y: 240; width: 300
        Rectangle { id: fFiller; objectName: "fFiller"; Layout.fillWidth: true; implicitWidth: 50; height: 10 }
        Rectangle { id: fFixed; objectName: "fFixed"; width: 20; height: 10 }
    }

    // A Box turns.
    Box {
        id: gBox; objectName: "gBox"; y: 260
        property bool wide: false
        width: 200; height: 300
        direction: wide ? Box.Row : Box.Column
        Rectangle { id: gDisplay; objectName: "gDisplay"; Layout.fillWidth: true; Layout.fillHeight: true }
        Rectangle { id: gPad; objectName: "gPad"; implicitWidth: 80; implicitHeight: 120 }
    }

    // A preferred size is asked for over an explicit one.
    Row {
        id: hRow; objectName: "hRow"; y: 570; width: 400
        Rectangle { id: hP; objectName: "hP"; implicitWidth: 80; width: 50; height: 10; Layout.preferredWidth: 70 }
        Rectangle { id: hQ; objectName: "hQ"; width: 20; height: 10 }
    }

    // Two that fill, asking for their explicit widths, share the room by them.
    Row {
        id: iRow; objectName: "iRow"; y: 590; width: 400
        Rectangle { id: iM; objectName: "iM"; implicitWidth: 10; width: 100; height: 10; Layout.fillWidth: true }
        Rectangle { id: iN; objectName: "iN"; implicitWidth: 10; width: 50; height: 10; Layout.fillWidth: true }
    }

    // A maximum holds one that fills; the room nobody takes is left at the end.
    Row {
        id: jRow; objectName: "jRow"; y: 610; width: 400
        Rectangle { id: jU; objectName: "jU"; Layout.fillWidth: true; Layout.maximumWidth: 100; implicitHeight: 10 }
        Rectangle { id: jV; objectName: "jV"; width: 30; height: 10 }
    }

    // A minimum over a preferred size, and a minimum over a maximum.
    Row {
        id: kRow; objectName: "kRow"; y: 630; width: 400
        Rectangle { id: kW; objectName: "kW"; Layout.preferredWidth: 10; Layout.minimumWidth: 30; height: 10 }
        Rectangle { id: kX; objectName: "kX"; Layout.preferredWidth: 45; Layout.minimumWidth: 50; Layout.maximumWidth: 40; height: 10 }
    }

    // Less room than they ask for: those that fill give it up.
    Row {
        id: lRow; objectName: "lRow"; y: 650; width: 120
        Rectangle { id: lA; objectName: "lA"; Layout.fillWidth: true; implicitWidth: 100; implicitHeight: 10 }
        Rectangle { id: lB; objectName: "lB"; Layout.fillWidth: true; implicitWidth: 50; implicitHeight: 10 }
    }

    // Across a Row: filling, keeping, preferring, and where one goes.
    Row {
        id: mRow; objectName: "mRow"; y: 670; width: 400; height: 50
        Rectangle { id: mFill; objectName: "mFill"; width: 10; Layout.fillHeight: true }
        Rectangle { id: mOwn; objectName: "mOwn"; width: 10; implicitHeight: 15; Layout.fillWidth: false }
        Rectangle { id: mPref; objectName: "mPref"; width: 10; implicitHeight: 30; Layout.preferredHeight: 20 }
        Rectangle { id: mCentre; objectName: "mCentre"; width: 10; Layout.preferredHeight: 20; Layout.alignment: 128 }
        Rectangle { id: mBottom; objectName: "mBottom"; width: 10; Layout.preferredHeight: 20; Layout.alignment: 64 }
    }

    // An explicit height down a Column.
    Column {
        id: nCol; objectName: "nCol"; y: 730; height: 200
        Rectangle { id: nH1; objectName: "nH1"; width: 10; implicitHeight: 10; height: 40 }
        Rectangle { id: nH2; objectName: "nH2"; width: 10; Layout.fillHeight: true }
    }

    // Padding around children that fill.
    Row {
        id: oRow; objectName: "oRow"; y: 940; width: 200; padding: 10; spacing: 5
        Rectangle { id: oA; objectName: "oA"; Layout.fillWidth: true; implicitHeight: 10 }
        Rectangle { id: oB; objectName: "oB"; width: 20; height: 10 }
    }

    // Right to left: a Row that plans, and one that packs.
    Row {
        id: pRow; objectName: "pRow"; y: 980; width: 200; spacing: 5
        layoutDirection: 1
        Rectangle { id: pA; objectName: "pA"; Layout.fillWidth: true; implicitWidth: 20; implicitHeight: 10 }
        Rectangle { id: pB; objectName: "pB"; width: 30; height: 10 }
    }
    Row {
        id: pLine; objectName: "pLine"; y: 1000; width: 200; spacing: 5
        layoutDirection: 1
        Rectangle { id: pC; objectName: "pC"; width: 20; height: 10 }
        Rectangle { id: pD; objectName: "pD"; width: 30; height: 10 }
    }

    // A Grid agrees with Qt's Grid positioner (ljos-grid-flow.feature).
    Grid {
        id: qGrid; objectName: "qGrid"; y: 1020
        columns: 3; spacing: 4; padding: 2
        Rectangle { id: qA; objectName: "qA"; width: 20; height: 10 }
        Rectangle { id: qB; objectName: "qB"; width: 30; height: 15 }
        Rectangle { id: qC; objectName: "qC"; width: 10; height: 10 }
        Rectangle { id: qD; objectName: "qD"; width: 25; height: 20 }
        Rectangle { id: qE; objectName: "qE"; width: 5; height: 5 }
    }

    // Two rows, column after column.
    Grid {
        id: rGrid; objectName: "rGrid"; y: 1080
        rows: 2; flow: Grid.TopToBottom; spacing: 3
        Rectangle { id: rA; objectName: "rA"; width: 20; height: 10 }
        Rectangle { id: rB; objectName: "rB"; width: 30; height: 15 }
        Rectangle { id: rC; objectName: "rC"; width: 10; height: 12 }
    }

    // One that fills its column, and one that spans both.
    Grid {
        id: sGrid; objectName: "sGrid"; y: 1120
        width: 200; columns: 2; columnSpacing: 10; rowSpacing: 4
        Rectangle { id: sA; objectName: "sA"; implicitWidth: 50; implicitHeight: 20 }
        Rectangle { id: sB; objectName: "sB"; Layout.fillWidth: true; implicitHeight: 20 }
        Rectangle { id: sC; objectName: "sC"; Layout.columnSpan: 2; Layout.fillWidth: true; implicitHeight: 10 }
    }

    // No count: one line along the flow.
    Grid {
        id: tGrid; objectName: "tGrid"; y: 1180; spacing: 5
        Rectangle { id: tA; objectName: "tA"; width: 20; height: 10 }
        Rectangle { id: tB; objectName: "tB"; width: 30; height: 15 }
        Rectangle { id: tC; objectName: "tC"; width: 10; height: 10 }
    }

    // A GridLayout's numbers, as the migration writes them (ljos-grid-pages.feature).
    Grid {
        id: uGrid; objectName: "uGrid"; y: 1200
        columnSpacing: 5; rowSpacing: 5; columns: 2; width: 200; height: 100
        Rectangle { id: uA; objectName: "uA"; Layout.alignment: 128; implicitWidth: 30; implicitHeight: 10; Layout.fillWidth: true }
        Rectangle { id: uB; objectName: "uB"; Layout.alignment: 128; implicitWidth: 50; implicitHeight: 20 }
        Rectangle { id: uC; objectName: "uC"; Layout.alignment: 128; implicitWidth: 30; implicitHeight: 10; Layout.fillHeight: true }
    }

    // An explicit width in a Grid is the request too.
    Grid {
        id: vGrid; objectName: "vGrid"; y: 1310
        columns: 2; width: 200
        Rectangle { id: vA; objectName: "vA"; implicitWidth: 80; width: 50; height: 10; Layout.preferredHeight: 10 }
        Rectangle { id: vB; objectName: "vB"; Layout.fillWidth: true; implicitHeight: 10 }
    }

    // Margins around one that fills.
    Row {
        id: wRow; objectName: "wRow"; y: 1330; width: 200
        Rectangle { id: wA; objectName: "wA"; Layout.fillWidth: true; Layout.margins: 5; implicitHeight: 10 }
    }

    // A Row in a Column, filling it.
    Column {
        id: xCol; objectName: "xCol"; y: 1360; width: 300
        Row {
            id: xRow; objectName: "xRow"; Layout.fillWidth: true
            Rectangle { id: xFill; objectName: "xFill"; Layout.fillWidth: true; implicitHeight: 10 }
            Rectangle { id: xFixed; objectName: "xFixed"; width: 20; height: 10 }
        }
    }

    // One that says nothing of its width keeps it in a Column.
    Column {
        id: yCol; objectName: "yCol"; y: 1390; width: 400
        Rectangle { id: yA; objectName: "yA"; implicitWidth: 120; implicitHeight: 30; Layout.preferredHeight: 10 }
    }

    // Two that fill a Grid's row between them.
    Grid {
        id: zGrid; objectName: "zGrid"; y: 1420
        columnSpacing: 5; rowSpacing: 5; columns: 2; width: 200
        Rectangle { id: zA; objectName: "zA"; Layout.alignment: 128; implicitWidth: 30; implicitHeight: 10; Layout.fillWidth: true }
        Rectangle { id: zB; objectName: "zB"; Layout.alignment: 128; implicitWidth: 50; implicitHeight: 20; Layout.fillWidth: true }
    }

    // A width the file gives a child is the one the arrangement first saw:
    // when the binding gives another, the child asks for the first again
    // once the row measures again.
    Row {
        id: aaRow; objectName: "aaRow"; y: 1460; width: 300; height: 30
        property bool big: false
        property bool more: false
        Rectangle { id: aaA; objectName: "aaA"; width: aaRow.big ? 200 : 100; height: 20; Layout.minimumWidth: 10 }
        Rectangle { id: aaB; objectName: "aaB"; width: 40; height: 20; Layout.fillWidth: true }
        Rectangle { id: aaC; objectName: "aaC"; width: 30; height: 20; Layout.preferredWidth: aaRow.more ? 31 : 30 }
    }

    // A preferred width that goes away: the child keeps the width it was
    // last placed at.
    Row {
        id: abRow; objectName: "abRow"; y: 1500; width: 300; height: 30
        property bool told: true
        Rectangle { id: abA; objectName: "abA"; width: 50; height: 20; Layout.preferredWidth: abRow.told ? 80 : -1 }
        Rectangle { id: abB; objectName: "abB"; width: 40; height: 20; Layout.fillWidth: true }
    }

    // One that fills, moved out of its row: it keeps the width it was
    // placed at, and the row closes up.
    Row {
        id: acRow; objectName: "acRow"; y: 1540; width: 300; height: 30
        Rectangle { id: acA; objectName: "acA"; width: 50; height: 20; Layout.fillWidth: true }
        Rectangle { id: acB; objectName: "acB"; width: 40; height: 20; Layout.preferredWidth: 40 }
    }
    Item { id: acHome; objectName: "acHome"; y: 1580; width: 10; height: 10 }

    // Children that span columns share the room by their columns, not by
    // their stretch factors.
    Grid {
        id: adGrid; objectName: "adGrid"; y: 1600; width: 300; columns: 4
        Rectangle { id: adA; objectName: "adA"; Layout.columnSpan: 2; Layout.fillWidth: true; Layout.preferredWidth: 0; Layout.horizontalStretchFactor: 1; implicitHeight: 10 }
        Rectangle { id: adB; objectName: "adB"; Layout.columnSpan: 2; Layout.fillWidth: true; Layout.preferredWidth: 0; Layout.horizontalStretchFactor: 2; implicitHeight: 10 }
    }
}
