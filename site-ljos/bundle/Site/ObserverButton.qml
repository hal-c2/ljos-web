import Ljos.Core
import Ljos.Ui
import Site
import "../observing.js" as Observing

// The Observer button of a stage's toolbar. The Observer is a chunk of
// its own, fetched once, ahead of the press, so that it opens at once:
// when the page is idle once the button is shown, or when the reader comes
// near the button. A page whose stages offer none fetches nothing of it.
StageButton {
    id: observer

    // False where the button is far from what the page is first for: then
    // only coming near it fetches.
    property bool prefetchesWhenIdle: true
    checkable: true
    text: t({ message: "Observer", context: "stage" })

    onApproached: Observing.prefetch()
    onVisibleChanged: {
        if (visible && observer.prefetchesWhenIdle)
            Observing.prefetchWhenIdle();
    }
    Component.onCompleted: {
        if (visible && observer.prefetchesWhenIdle)
            Observing.prefetchWhenIdle();
    }
}
