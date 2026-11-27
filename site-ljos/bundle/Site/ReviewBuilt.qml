pragma Singleton
import Ljos.Core
import Site

// What the framework review shows (Review/review.json), which the build
// writes into ReviewData.qml, read by name as ShowcaseBuilt reads the
// showcase's apps. Its own singleton, so only the review's module
// carries it.
Object {
    readonly property unknown data: ReviewData.data
}
