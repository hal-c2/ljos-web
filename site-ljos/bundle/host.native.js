.pragma library
// The site on the desktop (`mise run site:native`), where there is no
// browser: no address bar, no history and no server. It stands in the
// place of host.js in the bundle the desktop runs, so no browser loads
// it. A route is shown in place as in a browser running the shell. What
// a page reads is read from the directory the build wrote it into
// (scripts/build.mjs with LJOS_SITE_NATIVE), named by the application's
// argument `--site=<dir>`. Back and forward are a list kept here
// (Native.qml's keys). An address of another site opens in the
// desktop's browser.

// The directory the site stands in, as an address ending in "/"; "" where
// none was given.
function siteDir() {
    var args = Qt.application.arguments;
    for (var i = 0; i < args.length; i++) {
        var said = String(args[i]);
        if (said.indexOf("--site=") === 0) {
            var dir = said.slice("--site=".length);
            if (dir.charAt(dir.length - 1) !== "/")
                dir += "/";
            return dir.indexOf("://") < 0 ? "file://" + dir : dir;
        }
    }
    return "";
}

function navigation() {
    var shell = null;
    var root = "/";
    var site = siteDir();
    var readings = {};
    // The last way the reader asked to go: an answer for an earlier one,
    // come late, shows nothing.
    var asked = 0;
    // `at` is the entry shown; `aim` the one last asked for, which is
    // `at` again once it is shown or could not be.
    var list = { stack: [{ route: "/", fragment: "", offset: 0 }], at: 0, aim: 0 };

    // The JSON a file of the desktop's site holds (an address under the
    // site's directory), read as the page's own files are; it rejects
    // with the file's name when the file is missing or not JSON.
    function json(file) {
        return new Promise(function (resolve, reject) {
            var request = new XMLHttpRequest();
            request.onreadystatechange = function () {
                if (request.readyState !== XMLHttpRequest.DONE)
                    return;
                try {
                    resolve(JSON.parse(request.responseText));
                } catch (error) {
                    reject(new Error(file + ": " + error.message));
                }
            };
            request.open("GET", file);
            request.send();
        });
    }

    // What the route's page reads, from the file the build wrote; null for
    // a page that reads nothing.
    function reading(route) {
        if (shell.reading(route) === null)
            return Promise.resolve(null);
        var file = site + route.slice(1) + "page.json";
        if (!(file in readings)) {
            readings[file] = json(file);
            readings[file].catch(function () {
                delete readings[file];
            });
        }
        return readings[file];
    }

    // The page shown keeps where the reader left it.
    function keep() {
        if (shell && list.at >= 0)
            list.stack[list.at].offset = shell.offset();
    }

    // The route's page shown once its reading is had. Only then does the
    // list move (`commit`), the page left keeping where it was at that
    // moment: a page that cannot be read leaves the list as it was, and
    // says so.
    function show(route, fragment, offset, commit) {
        var mine = ++asked;
        reading(route).then(
            function (read) {
                if (mine !== asked)
                    return;
                keep();
                commit();
                list.aim = list.at;
                shell.show(route, fragment, offset, read);
            },
            function (error) {
                console.warn("site: " + error.message);
                if (mine === asked)
                    list.aim = list.at;
            },
        );
    }

    function go(address) {
        var said = String(address);
        if (/^[a-z][a-z0-9+.-]*:/i.test(said) || said.indexOf("//") === 0) {
            Qt.openUrlExternally(said.indexOf("//") === 0 ? "https:" + said : said);
            return;
        }
        var hash = said.indexOf("#");
        var fragment = hash >= 0 ? said.slice(hash) : "";
        var path = hash >= 0 ? said.slice(0, hash) : said;
        if (path.indexOf(root) !== 0)
            return;
        var route = "/" + path.slice(root.length);
        if (shell.title(route) === null) {
            console.warn("site: no page at " + route);
            return;
        }
        // A page and fragment already shown is shown again in its entry, as
        // a browser does with the address it is at.
        var here = list.stack[list.at];
        var same = here.route === route && here.fragment === fragment;
        show(route, fragment, null, function () {
            if (same)
                return;
            list.stack = list.stack.slice(0, list.at + 1).concat([{ route: route, fragment: fragment, offset: 0 }]);
            list.at = list.stack.length - 1;
        });
    }

    // Back or forward one page, to where it was left; false where there is
    // none that way. A press while the page before it is still being read
    // goes on from that page, so two quick presses go back two.
    function step(by) {
        var to = list.aim + by;
        if (to < 0 || to >= list.stack.length)
            return false;
        list.aim = to;
        // The page shown keeps where it is now: a press that comes before
        // the last one's read goes to an entry that may be this page.
        keep();
        var entry = list.stack[to];
        show(entry.route, "", entry.offset, function () {
            list.at = to;
        });
        return true;
    }

    return {
        // The shell (nav.js `follow`) and the base the site names its
        // routes from.
        start: function (given, base) {
            shell = given;
            root = base;
        },
        go: go,
        step: step,
        keep: keep,
        // The JSON of a file at an address.
        read: json,
        // The JSON of a file the build wrote into the site's directory
        // ("search.json").
        site: function (name) {
            return json(site + name);
        },
        // The site's directory, which a file named from the site's root
        // is under (nav.js `fromPage`).
        root: site,
        // The Observer dock's panel: on the desktop, where its Observer is
        // (Site/ObserverDock.qml).
        observer: Qt.resolvedUrl("Site/ObserverNote.qml"),
        // The address of a QML file in the bundle, from its name without
        // ".qml": the desktop's loaders take a file by its address alone.
        qml: function (name) {
            return Qt.resolvedUrl(name + ".qml");
        },
        // What a live code block or the Pantry's editor says in place of
        // compiling (live.js, Demos/pantry-live.js).
        noLive: "Live editing runs in the browser; on the desktop this is the example as it was built.",
        // What a demo's frame says under its picture (Site/DemoFrame.qml).
        noDemo: "A picture of the demo: it runs in the browser, on ljos.dev.",
        list: function () {
            return list;
        },
    };
}

var desktop = navigation();
