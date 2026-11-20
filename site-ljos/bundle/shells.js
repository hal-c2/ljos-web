.pragma library
// The shell a reader picked for this site, kept as their scheme is
// (scheme.js), and what a shell needs of the page around it: when the
// page has been taken over, how long that took, and the source of
// each shell the site ships.
//
// The build prerenders every page in the default shell only: a page
// written in each of three would be three times the HTML for what the
// reader sees one of. So the shell kept is applied once the page has
// hydrated (`whenHydrated`), never while it is being taken over, which
// would be a page other than the one the build wrote.
var key = "ljos.dev:shell";
var names = ["marketing", "workbench", "desktop"];

// The shell kept, or "" where none is or can be, as in the build.
function picked() {
    try {
        var kept = globalThis.localStorage && globalThis.localStorage.getItem(key);
        return names.indexOf(kept) >= 0 ? kept : "";
    } catch (error) {
        return "";
    }
}

// Keeps the reader's pick; a browser that keeps nothing (storage off)
// still shows it on this page.
function keep(name) {
    try {
        if (globalThis.localStorage)
            globalThis.localStorage.setItem(key, name);
    } catch (error) {
    }
}

// Calls `then(ms)` once the page has been taken over (the runtime says
// so on `#app`, `data-ljos-hydrated`), with the time since the page was
// asked for; at once on a page that is mounted rather than hydrated,
// and never in the build. The attribute is watched, not polled.
function whenHydrated(then) {
    var document = globalThis.document;
    var app = document && document.getElementById("app");
    var agent = globalThis.navigator ? String(globalThis.navigator.userAgent) : "";
    if (!app || agent === "" || agent.indexOf("ljos-web prerender") >= 0)
        return;
    var now = function () {
        return globalThis.performance ? Math.round(globalThis.performance.now()) : 0;
    };
    var done = function () {
        return app.getAttribute("data-ljos-hydrated") === "true" || !app.querySelector("[data-hk]");
    };
    if (done()) {
        Promise.resolve().then(function () {
            then(now());
        });
        return;
    }
    var watching = new globalThis.MutationObserver(function () {
        if (app.getAttribute("data-ljos-hydrated") !== "true")
            return;
        watching.disconnect();
        then(now());
    });
    watching.observe(app, { attributes: true, attributeFilter: ["data-ljos-hydrated"] });
}

// How many objects the item `root` holds, itself and what it has made:
// its children and its other declared objects (`resources`), all the way
// down. Counted when it is asked, never on a timer.
function alive(root) {
    var count = 0;
    var seen = new Set();
    var stack = [root];
    while (stack.length > 0) {
        var object = stack.pop();
        if (!object || seen.has(object))
            continue;
        seen.add(object);
        count++;
        var kids = object.children;
        if (kids)
            for (var i = 0; i < kids.length; i++)
                stack.push(kids[i]);
        var held = object.resources;
        if (held)
            for (var j = 0; j < held.length; j++)
                stack.push(held[j]);
    }
    return count;
}

// The source of each shell the site ships, `{ Marketing: { text, rich } … }`,
// written by the build from bundle/Shells (scripts/build.mjs). Imported
// when a reader asks to see one, so no page loads them before.
function sources() {
    return import("./Shells/sources.json").then(function (made) {
        return made.default || made;
    });
}

// A shell the reader wrote, compiled in the page as the Pantry demo's
// is (Demos/pantry-live.js): against the page's own modules, so the
// controls it draws with and the slots it places are the page's, and
// the site's pieces stand in them. Answers the loader's module, or
// throws with what broke and where.
var compiler = null;
function compiled(file, text) {
    return function () {
        var compile = compiler ? Promise.resolve(compiler) : Promise.all([import("ljos-web/compiler"), import("ljos-web/compiler/modules")]).then(function (made) {
            // As bundle/live.js gives an example's: Ljós's own controls
            // are QML that comes with the runtime, so the compiler is
            // told where they are; the rest is the page's module map.
            var modules = Object.assign({}, made[1].modules, {
                "ljos-web/Ljos/Controls": function () {
                    return import("ljos-web/Ljos/Controls");
                },
                "ljos-web/Ljos/Controls/Basic": function () {
                    return import("ljos-web/Ljos/Controls/Basic");
                },
                "ljos-web/Ljos/Design": function () {
                    return import("ljos-web/Ljos/Design");
                }
            });
            compiler = made[0].createCompiler({ modules: modules });
            return compiler;
        });
        return compile.then(function (run) {
            var files = {};
            files[file] = text;
            return run.compile({ files: files, entry: file });
        }).then(function (made) {
            if (made.diagnostics) {
                throw new Error(made.diagnostics.map(function (d) {
                    return d.line ? (d.file || file) + ":" + d.line + ":" + (d.column || 1) + ": " + d.message : (d.file || file) + ": " + d.message;
                }).join("\n"));
            }
            return { "default": made.component };
        });
    };
}

// Swaps the shell (`change()`, which sets what the loader shows) as one
// view transition where the browser has them: the old shell's picture
// gives way to the new one's, which the page's styles move (assets/
// head.html: a rise and a scale, or with reduced motion a crossfade).
// The transition is let go when `arrived` says the new shell is in,
// and in any case after a second, so a shell that never comes does not
// hold the page still; at once if `change()` answers false, having
// changed nothing. Answers false where there are none, for the shell
// to fade itself in instead.
function swap(change, calm, arrived) {
    var document = globalThis.document;
    var root = document && document.documentElement;
    if (!root || typeof document.startViewTransition !== "function") {
        change();
        return false;
    }
    root.dataset.ljosSwap = calm ? "calm" : "rich";
    var transition = document.startViewTransition(function () {
        if (change() === false)
            return undefined;
        return new Promise(function (done) {
            var waited = globalThis.setTimeout(done, 1000);
            arrived(function () {
                globalThis.clearTimeout(waited);
                done();
            });
        });
    });
    transition.finished.then(function () {
        delete root.dataset.ljosSwap;
    }, function () {
        delete root.dataset.ljosSwap;
    });
    return true;
}

// Shown once the kept shell is in: the page the head script held back
// (assets/head.html) fades in, the shell it was waiting for in place.
// Not once the watchdog has shown it: it would fade in a second time.
function shown() {
    var document = globalThis.document;
    if (document && document.documentElement && !late())
        document.documentElement.dataset.ljosShellShown = "";
}

// Whether the head's watchdog (assets/head.html) has shown the page
// already, the kept shell not yet in: it says so on the root,
// `data-ljos-shell-late`, when its animation ends.
function late() {
    var document = globalThis.document;
    return !!(document && document.documentElement && "ljosShellLate" in document.documentElement.dataset);
}

// Calls `then()` once, if the watchdog shows the page before `shown`
// has: the attribute is watched, not polled.
function whenLate(then) {
    var document = globalThis.document;
    var root = document && document.documentElement;
    if (!root || !globalThis.MutationObserver)
        return;
    var watching = new globalThis.MutationObserver(function () {
        if ("ljosShellShown" in root.dataset) {
            watching.disconnect();
        } else if ("ljosShellLate" in root.dataset) {
            watching.disconnect();
            then();
        }
    });
    watching.observe(root, { attributes: true, attributeFilter: ["data-ljos-shell-late", "data-ljos-shell-shown"] });
}

// Back and forward through the reader's own history, as the browser's
// buttons are: a shell's toolbar has them too (Shells/Desktop.qml).
function back() {
    try {
        globalThis.history.back();
    } catch (error) {
    }
}
function forward() {
    try {
        globalThis.history.forward();
    } catch (error) {
    }
}

// Which shell frames the page, on its root (`data-ljos-shell-showing`).
function showing(name) {
    var document = globalThis.document;
    if (document && document.documentElement && name)
        document.documentElement.dataset.ljosShellShowing = name;
}
