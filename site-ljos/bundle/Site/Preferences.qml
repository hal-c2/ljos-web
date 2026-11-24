import QtQuick
import Site
import Ljos.Core
import "../shells.js" as Shells

// What the reader has chosen for this site: its colour scheme, whether
// it moves less, which shell it is shown in and the language it is read
// in. Each is kept for the next visit (scheme.js, motion.js, shells.js,
// site-languages.js); a shell only shows the choices and asks for another.
QtObject {
    id: preferences

    // "system", "light" or "dark".
    readonly property string scheme: Theme.picked === "" ? "system" : Theme.picked
    readonly property bool dark: Theme.dark
    readonly property bool calm: Theme.calm

    // The shell the reader picked, which is the one shown: each has a
    // phone's layout of its own (a narrow Workbench or Desktop is one
    // pane with a tab bar along the bottom). Every page is prerendered in
    // the Elegant shell, so `shell` is that until the page has been taken
    // over (Main.qml). `wide` is whether the window is a desktop's.
    property string shell: "elegant"
    property bool wide: true
    readonly property string shown: shell

    readonly property var shells: [
        { name: "elegant", label: t`Elegant`, about: t`Editorial layout for reading, trying demos, and comparing specs.` },
        { name: "cyberpunk", label: t`Cyberpunk`, about: t`Full-bleed HUD console with live telemetry rails and mission-style panels.` },
        { name: "workbench", label: t`Workbench`, about: t`IDE-style workspace with file tree, tabbed centre pane, and inspector docks.` },
        { name: "desktop", label: t`Desktop`, about: t`Classic desktop application window with menu bar, toolbar, sidebar, and status bar.` }
    ]
    readonly property var schemes: [
        { name: "system", label: t`System` },
        { name: "light", label: t`Light` },
        { name: "dark", label: t`Dark` }
    ]

    // The languages the site is read in, each named as it names itself
    // (a reader looking for their own finds it written as they write it),
    // and the one it is read in: `App.language`, which the page's start
    // sets from the address, the reader's last pick or the browser's own
    // (ljos-web's site-languages.js). Each but English has its catalogue,
    // i18n/<tag>.po; site-tests/i18n.spec.js holds the two to each other.
    readonly property var languages: [
        { tag: "en", name: "English", english: "English" },
        { tag: "es", name: "Español", english: "Spanish" },
        { tag: "zh-Hans", name: "简体中文", english: "Chinese (Simplified)" },
        { tag: "hi", name: "हिन्दी", english: "Hindi" },
        { tag: "ar", name: "العربية", english: "Arabic" },
        { tag: "pt-BR", name: "Português (Brasil)", english: "Portuguese (Brazil)" },
        { tag: "fr", name: "Français", english: "French" },
        { tag: "de", name: "Deutsch", english: "German" },
        { tag: "ja", name: "日本語", english: "Japanese" },
        { tag: "ru", name: "Русский", english: "Russian" },
        { tag: "is", name: "Íslenska", english: "Icelandic" }
    ]
    readonly property string language: {
        var asked = String(App.language).toLowerCase();
        var found = languages.find((one) => one.tag.toLowerCase() === asked);
        return found ? found.tag : "en";
    }
    readonly property string languageName: {
        var found = languages.find((one) => one.tag === preferences.language);
        return found ? found.name : "English";
    }
    function setLanguage(tag) {
        if (languages.some((one) => one.tag === tag))
            App.language = tag;
    }

    function labelOf(name) {
        var found = shells.find((one) => one.name === name);
        return found ? found.label : name;
    }

    function setScheme(name) {
        Theme.pick(name === "system" ? "" : name);
    }
    function setCalm(wanted) {
        Theme.setCalm(wanted);
    }
    function setShell(name) {
        if (!shells.some((one) => one.name === name))
            return;
        preferences.shell = name;
        Shells.keep(name);
    }
}
