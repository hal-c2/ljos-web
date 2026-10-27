import QtQml

// The type entry `qmlc` compiles against: what the Rust `Counter` is, as
// QML declarations. Nothing here runs. At run time the build puts
// `web/Counter.js` (the type over the wasm) where compiled QML asks for
// this file (see `vite.config.js`), as a stand-in's own QML would be run
// for a type a program has in C++.
//
// In ljos-web this file is not written at all: the same facts reach the
// compiler from the application's `ljostypes.json`, through the type
// table (`docs/LJOS_WEB.md`).
QtObject {
    property int count: 0
    property int step: 1
    signal bumped(int value)
    function increment() {}
}
