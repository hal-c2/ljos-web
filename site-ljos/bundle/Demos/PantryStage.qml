pragma Scripts: JavaScript
import Ljos.Ui
import Ljos.Blocks

// The Pantry's stage, given what Ljos.Blocks' ShellLoader cannot be
// given yet: its `source` and `fallback` are urls, where a visitor's
// shell comes compiled in the page and the app's own shell as a
// component. Its `reload` is the web runtime's: the native
// ShellLoader's type has none. The file is plain JavaScript (the pragma)
// so those untyped values reach the loader; PantryDemo, which uses it, stays
// typed throughout.
ShellLoader {
    id: loader
    // The visitor's shell, compiled in the page, or nothing.
    property unknown module
    // What stands until then: the app's own shell.
    property unknown stand
    // An empty url, not undefined, until there is one: the native
    // ShellLoader's `source` is a url, and both runtimes read "" as none.
    source: module ?? ""
    fallback: stand

    // Makes the shell again from what `module` gives now, and answers
    // why the swap happened (or did not).
    function reloadModule(): var {
        return loader.reload();
    }
}
