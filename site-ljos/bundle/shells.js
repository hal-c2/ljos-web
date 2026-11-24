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
var names = ["elegant", "cyberpunk", "workbench", "desktop"];

// What a shell was called before, to the name it has now: a reader who
// picked it then keeps it.
var renamed = { marketing: "elegant" };

// The shell kept, or "" where none is or can be, as in the build.
function picked() {
    try {
        var kept = globalThis.localStorage && globalThis.localStorage.getItem(key);
        if (renamed[kept])
            kept = renamed[kept];
        return names.indexOf(kept) >= 0 ? kept : "";
    } catch (error) {
        return "";
    }
}

// Keeps the reader's pick; a browser that keeps nothing (storage off)
// still shows it on this page.
function keep(name) {
    dress(name);
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

// The source of each shell the site ships, `{ Elegant: { text, rich } … }`,
// written by the build beside the pages (scripts/build.mjs), at the
// site's `base`. Fetched when a reader asks to see one, so no page loads
// them before. Fetched as data, not imported: a browser may keep a
// module that failed to come as failed, so a Retry would fail again,
// where a fetch is made anew. Only an answer that came, and holds the
// shells and pages, is kept: anything else is thrown, so it is asked for
// again and the editor offers its Retry.
var catalog = null;
function sources(base) {
    if (catalog === null) {
        catalog = globalThis.fetch(base.slice(0, -1) + "/shell-sources.json").then(function (response) {
            if (!response.ok)
                throw new Error("shell-sources.json: " + response.status);
            return response.json();
        }).then(function (all) {
            if (!all || typeof all.shells !== "object" || all.shells === null || typeof all.pages !== "object" || all.pages === null)
                throw new Error("shell-sources.json holds no shells");
            return all;
        });
        catalog.catch(function () {
            catalog = null;
        });
    }
    return catalog;
}

// A shell the reader wrote, compiled in the page as the Pantry demo's
// is (Demos/pantry-live.js): against the page's own modules, so the
// controls it draws with and the slots it places are the page's, and
// the site's pieces stand in them. Answers the loader's module, or
// throws with what broke and where.
var compiler = null;
function made(file, text) {
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
    });
}
// What a diagnostic says, where it is: "file:line:column: message".
function said(file, d) {
    return d.line ? (d.file || file) + ":" + d.line + ":" + (d.column || 1) + ": " + d.message : (d.file || file) + ": " + d.message;
}
function compiled(file, text) {
    return function () {
        return made(file, text).then(function (made) {
            if (made.diagnostics)
                throw new Error(made.diagnostics.map(function (d) { return said(file, d); }).join("\n"));
            return { "default": made.component };
        });
    };
}

// Which shell's QML the editor took, for the site's own test, which opts
// in as it does for `checked` below: the editor may come while another
// shell is shown, and is still of the shell that asked for it.
function editorHeld(name) {
    var probe = globalThis.__ljosTest;
    if (probe)
        probe.liveHeld = name;
}

// The same, for an editor that runs each edit as it is typed (Site/
// LiveSource.qml): answers what is wrong with it, each with where and
// the words to show, or the shell it makes, for a loader to show. Never
// throws: a broken edit is the reader's to mend, not an error.
//
// The site's own test counts the edits asked of the compiler (`liveAsks`)
// and the answers given (`liveAnswers`), so one that is to change nothing
// can be waited for, and one asked again told from one answered: it opts in by putting
// `__ljosTest` on the page before it loads, as the Pantry demo's does
// (Demos/pantry-live.js); a visitor's page records nothing.
function checked(file, text) {
    var asking = globalThis.__ljosTest;
    if (asking)
        asking.liveAsks = (asking.liveAsks || 0) + 1;
    return made(file, text).then(function (made) {
        var probe = globalThis.__ljosTest;
        if (probe)
            probe.liveAnswers = (probe.liveAnswers || 0) + 1;
        if (made.diagnostics)
            return {
                diagnostics: made.diagnostics.map(function (d) {
                    return { file: d.file || file, line: d.line || 0, column: d.column || 0, endLine: d.endLine, endColumn: d.endColumn, message: d.message, text: said(file, d) };
                })
            };
        var module = { "default": made.component };
        return {
            shell: function () {
                return Promise.resolve(module);
            }
        };
    }, function (error) {
        return { diagnostics: [{ file: file, line: 0, column: 0, message: String(error && error.message || error), text: file + ": " + String(error && error.message || error) }] };
    });
}

// Swaps the shell (`change()`, which sets what the loader shows) as one
// view transition where the browser has them: the old shell's picture
// gives way to the new one's, which the page's styles move (assets/
// head.html: `kind` "rich", a rise and a scale; "glitch", Cyberpunk's
// slices and jitter; "calm", for reduced motion, a crossfade).
// The transition is let go when `arrived` says the new shell is in,
// and in any case after a second, so a shell that never comes does not
// hold the page still; at once if `change()` answers false, having
// changed nothing. Answers false where there are none, for the shell
// to fade itself in instead.
function swap(change, kind, arrived) {
    var document = globalThis.document;
    var root = document && document.documentElement;
    if (!root || typeof document.startViewTransition !== "function") {
        change();
        return false;
    }
    root.dataset.ljosSwap = kind;
    var transition = document.startViewTransition(function () {
        if (change() === false)
            return undefined;
        return new Promise(function (done) {
            var waited = globalThis.setTimeout(done, 1000);
            arrived(function () {
                var go = function () {
                    globalThis.clearTimeout(waited);
                    done();
                };
                if (dressed)
                    dressed.then(go);
                else
                    go();
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
    if (document && document.documentElement && !late()) {
        document.documentElement.dataset.ljosShellShown = "";
        unhold();
    }
}

// Whether the head's watchdog (assets/head.html) has shown the page
// already, the kept shell not yet in: it says so on the root,
// `data-ljos-shell-late`, on its timer or as its fade starts.
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
// While the head holds the page back for the kept shell (its
// `data-ljos-shell`), one framing it on the way is not what the reader
// will see: it is said once the page is shown (`held`), and until then
// the ground keeps the kept shell's colours (the build's `looks`).
var held = "";
function showing(name) {
    var document = globalThis.document;
    var root = document && document.documentElement;
    dress(name);
    if (!root || !name)
        return;
    var kept = root.dataset.ljosShell;
    if (kept && kept !== name && !("ljosShellShown" in root.dataset) && !late()) {
        if (!held)
            whenLate(unhold);
        held = name;
        return;
    }
    held = "";
    root.dataset.ljosShellShowing = name;
}
function unhold() {
    var document = globalThis.document;
    if (held && document && document.documentElement)
        document.documentElement.dataset.ljosShellShowing = held;
    held = "";
}

// The other shells' colours (the build's `looks`, which the head names
// in `meta[name="ljos-looks"]`) asked for as a stylesheet once a shell
// other than the default is kept or shown; `dressed` is their arrival,
// which a swap waits for as it waits for the shell. A stylesheet that
// failed to come is dropped and asked for once more; one that fails
// again is asked for at the next shell picked.
var dressed = null;
var askedAgain = false;
function dress(name) {
    var document = globalThis.document;
    if (!document || !document.head || !name || name === "elegant")
        return;
    var sheet = document.getElementById("ljos-looks");
    if (sheet) {
        if (!dressed)
            dressed = come(sheet, name);
        return;
    }
    var named = document.querySelector('meta[name="ljos-looks"]');
    if (!named)
        return;
    sheet = document.createElement("link");
    sheet.id = "ljos-looks";
    sheet.rel = "stylesheet";
    sheet.href = named.content;
    dressed = come(sheet, name);
    document.head.appendChild(sheet);
}

// When `sheet` has come, or failed to and been asked for again. One the
// head asked for may have come already: its rules are then there.
function come(sheet, name) {
    if (sheet.sheet)
        return Promise.resolve();
    return new Promise(function (done) {
        sheet.addEventListener("load", function () {
            done();
        });
        sheet.addEventListener("error", function () {
            sheet.remove();
            dressed = null;
            if (askedAgain) {
                done();
                return;
            }
            askedAgain = true;
            dress(name);
            if (dressed)
                dressed.then(done);
            else
                done();
        });
    });
}

// The page loaded again: every demo as it first ran.
function reload() {
    if (globalThis.location)
        globalThis.location.reload();
}
