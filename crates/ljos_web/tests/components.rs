//! What one QML file asks of another: a component takes exactly what the
//! instances in its project set on it.

use ljos_web::{Options, Project, compile, lowered_source};

/// The lowering of `name`, compiled with all of `files`.
fn lowered_in(files: &[(&str, &str)], name: &str) -> Result<String, Vec<String>> {
    let mut project = Project::new();
    for (file, source) in files {
        project.add(file, source).unwrap_or_else(|errors| panic!("{file}: {errors:?}"));
    }
    let options = Options { name: name.to_string(), project: Some(project), ..Options::default() };
    let source = files.iter().find(|(file, _)| *file == name).expect("a file of the project").1;
    // What does not lower would not compile either; what lowers, Solid takes.
    lowered_source(source, &options)
        .and_then(|lowered| compile(source, &options).map(|_| lowered))
        .map_err(|errors| errors.into_iter().map(|error| error.message).collect())
}

fn lowered(files: &[(&str, &str)], name: &str) -> String {
    lowered_in(files, name).unwrap_or_else(|errors| panic!("{name}: {errors:?}"))
}

#[track_caller]
fn assert_contains(haystack: &str, needle: &str) {
    assert!(haystack.contains(needle), "expected to find\n  {needle}\nin\n{haystack}");
}

const BADGE: &str = r#"import OpenTUI
Text {
    property string label: "?"
    text: label
    color: "gray"
}"#;

#[test]
fn a_component_takes_what_its_instances_set() {
    let app = r#"import OpenTUI
Item {
    Badge { label: "a"; color: Shell.state.color; font.bold: true }
    Badge { onMouseDown: Shell.dispatch("b") }
}"#;
    let files = [("App", app), ("Badge", BADGE)];
    let badge = lowered(&files, "Badge");
    // A property of the root object: the instance's value, or the component's own.
    assert_contains(&badge, r#""color": props.color !== undefined ? props.color : "gray""#);
    // One the component does not bind.
    assert_contains(&badge, r#""font-weight": props.font$bold ? "bold" : void 0"#);
    assert_contains(&badge, "onMouseDown={props.onMouseDown}");
    let app = lowered(&files, "App");
    assert_contains(&app, r#"<Badge label={"a"} color={Shell.state.color} font$bold={true}></Badge>"#);
    assert_contains(&app, r#"<Badge onMouseDown={() => Shell.dispatch("b")}></Badge>"#);

    // Used by nothing, it takes nothing but what it declares.
    let alone = lowered(&[("Badge", BADGE)], "Badge");
    assert_contains(&alone, r#"<span class="q-text" style={{ "color": "gray" }}>{root$label()}</span>"#);
}

#[test]
fn what_an_instance_sets_must_exist() {
    let errors = |app: &str| lowered_in(&[("App", app), ("Badge", BADGE)], "App").unwrap_err();
    assert_eq!(
        errors("import OpenTUI\nItem { Badge { nope: 1 } }"),
        ["`Badge` has no property `nope`"]
    );
    assert_eq!(
        errors("import OpenTUI\nItem { Badge { wrapMode: \"none\" } }"),
        ["`wrapMode` of `Badge` cannot be set from outside the component yet"]
    );
    assert_eq!(
        errors("import OpenTUI\nItem { Bagde {} }"),
        ["`Bagde` is not a type: no imported module the web target knows has it, and no `Bagde.qml` is next to this file"]
    );
    // The types are the imports', not the compiler's.
    assert_eq!(
        lowered_in(&[("App", "Item {}")], "App").unwrap_err(),
        ["`Item` is not a type of anything the file imports"]
    );
}

#[test]
fn a_component_on_a_component_passes_on_what_is_not_its_own() {
    let loud = r#"import OpenTUI
Badge {
    property bool shout: false
    label: shout ? "!" : "."
    color: "red"
}"#;
    let app = r#"import OpenTUI
Item { Loud { shout: true; color: "blue"; marginTop: 1 } }"#;
    let files = [("App", app), ("Badge", BADGE), ("Loud", loud)];
    assert_contains(
        &lowered(&files, "Loud"),
        r#"<Badge label={root$shout() ? "!" : "."} color={props.color !== undefined ? props.color : "red"} marginTop={props.marginTop}></Badge>"#,
    );
    // Asked of `Loud`, taken by the root of `Badge`.
    assert_contains(&lowered(&files, "Badge"), r#""margin-top": $lh(props.marginTop)"#);
}

#[test]
fn children_of_an_instance() {
    let frame = r#"import OpenTUI
Rectangle { Text { text: "top" } }"#;
    let slotted = r#"import OpenTUI
Rectangle {
    default property alias content: body.data
    Item { id: body }
    Text { text: "bottom" }
}"#;
    let app = r#"import OpenTUI
Item {
    Frame { Text { text: "a" } }
    Slotted { Text { text: "b" } }
}"#;
    let files = [("App", app), ("Frame", frame), ("Slotted", slotted)];
    assert_contains(&lowered(&files, "Frame"), r#"<span class="q-text">{"top"}</span>{props.children}</div>"#);
    assert_contains(&lowered(&files, "Slotted"), r#"<div class="q-item">{props.children}</div><span"#);
    assert_contains(&lowered(&files, "App"), r#"<Frame><span class="q-text">{"a"}</span></Frame>"#);
    // No instance has children: no slot.
    assert!(!lowered(&[("Frame", frame)], "Frame").contains("children"));
}

#[test]
fn signals() {
    let list = r#"import OpenTUI
Item {
    id: list
    signal picked(int index, string label)
    signal closed
    onClosed: Shell.dispatch("closed")
    Text { text: "x"; onMouseDown: list.picked(1, "one") }
    Item {
        id: inner
        signal poked(var how)
        onPoked: Shell.dispatch("poked", how)
        Text { text: "y"; onMouseDown: inner.poked("hard") }
    }
}"#;
    let app = r#"import OpenTUI
Item {
    List { onPicked: Shell.dispatch(label, index) }
}"#;
    let files = [("App", app), ("List", list)];
    let list = lowered(&files, "List");
    // Emitting is calling: the instance's handler, after the component's own.
    assert_contains(&list, "const list$picked = (...$args) => {\n\t\tprops.onPicked?.(...$args);\n\t};");
    assert_contains(&list, "(() => Shell.dispatch(\"closed\"))(...$args);\n\t\tprops.onClosed?.(...$args);");
    assert_contains(&list, r#"onMouseDown={() => list$picked(1, "one")}"#);
    // A signal that is not the component's has only the handler next to it.
    assert_contains(&list, r#"const inner$poked = (how) => Shell.dispatch("poked", how);"#);
    // The handler's arguments have the names the signal gave them.
    assert_contains(
        &lowered(&files, "App"),
        "<List onPicked={(index, label) => Shell.dispatch(label, index)}></List>",
    );
}

#[test]
fn aliases() {
    let field = r#"import OpenTUI
Item {
    id: field
    property alias label: caption.text
    property alias hint: note.text
    property alias tone: note.shade
    Text { id: caption; color: label === "" ? "gray" : "white" }
    Text {
        id: note
        property string shade: "dim"
        text: "none"
        color: shade
        onMouseDown: field.hint = "clicked"
    }
}"#;
    let app = r#"import OpenTUI
Item { Field { label: "Name"; tone: "bright" } }"#;
    let files = [("App", app), ("Field", field)];
    let field = lowered(&files, "Field");
    // Of a built-in property: the alias is the binding, the property reads it.
    assert_contains(&field, "const field$label = () => props.label;");
    assert_contains(&field, r#"{ "color": field$label() === "" ? "gray" : "white" }}>{field$label()}</span>"#);
    // Assigned to: a signal that starts from the instance's value or the default.
    assert_contains(
        &field,
        r#"const [field$hint, set$field$hint] = createSignal(() => props.hint !== undefined ? props.hint : "none");"#,
    );
    assert_contains(&field, r#"onMouseDown={() => set$field$hint("clicked")}>{field$hint()}</span>"#);
    // Of a declared property: another name for it, which the instance may set.
    assert_contains(&field, r#"const note$shade = () => props.tone !== undefined ? props.tone : "dim";"#);

    let errors = |source: &str| lowered_in(&[("Field", source)], "Field").unwrap_err();
    assert_eq!(
        errors("import OpenTUI\nItem { property alias label: nobody.text }"),
        ["`nobody` is not an id in this component"]
    );
    assert_eq!(
        errors("import OpenTUI\nItem { property alias other: inner\n Item { id: inner } }"),
        ["aliases of anything but `id.property` are not supported yet"]
    );
}

#[test]
fn inline_components() {
    let app = r#"import OpenTUI
Item {
    id: app
    readonly property string tone: "red"
    component Pill: Text {
        id: pill
        property string label: "?"
        text: "[" + label + "]"
    }
    Pill { label: "a"; color: app.tone }
    Pill {}
}"#;
    let code = lowered(&[("App", app)], "App");
    // A function of the module, taking what this file's instances set.
    assert_contains(&code, "function Pill(props) {");
    assert_contains(&code, r#"style={{ "color": props.color }}>{"[" + pill$label() + "]"}</span>"#);
    assert_contains(&code, r#"<Pill label={"a"} color={app$tone}></Pill><Pill></Pill>"#);
    assert!(!code.contains("import Pill"), "{code}");

    // Nothing around it is in its scope.
    let leaky = app.replace(r#""[" + label + "]""#, "tone");
    assert_eq!(lowered_in(&[("App", &leaky)], "App").unwrap_err(), ["`tone` is not defined"]);
    let leaky = app.replace(r#""[" + label + "]""#, "app.tone");
    assert_eq!(lowered_in(&[("App", &leaky)], "App").unwrap_err(), ["`app` is not defined"]);
}

#[test]
fn change_handlers_and_lifecycle() {
    let counter = r#"import OpenTUI
Item {
    id: counter
    property int count: 0
    readonly property int fixed: 1
    onCountChanged: Shell.dispatch("count", count)
    onFixedChanged: Shell.dispatch("never")
    Component.onCompleted: Shell.dispatch("ready")
    Component.onDestruction: { Shell.dispatch("gone") }
    Text { text: "+"; onMouseDown: counter.count += 1 }
}"#;
    let app = r#"import OpenTUI
Item { Counter { onCountChanged: Shell.dispatch("outside") } }"#;
    let files = [("App", app), ("Counter", counter)];
    let code = lowered(&files, "Counter");
    // When it changes, not when it is first set; the instance's handler too.
    assert_contains(&code, "createEffect(counter$count, (...$args) => {");
    assert_contains(&code, "props.onCountChanged?.(...$args);\n\t}, { \"defer\": true });");
    // A constant never changes.
    assert!(!code.contains("never"), "{code}");
    assert_contains(&code, "onSettled(() => {\n\t\tShell.dispatch(\"ready\");\n\t});");
    assert_contains(&code, "onCleanup(() => {\n\t\tShell.dispatch(\"gone\");\n\t});");
    assert_contains(&code, r#"import { createEffect, createSignal, onCleanup, onSettled } from "solid-js";"#);
}

#[test]
fn a_file_alone_takes_unknown_types_for_components() {
    let options = Options { name: "App".to_string(), ..Options::default() };
    let code = lowered_source("import OpenTUI\nItem { Badge { label: qsTr(\"a\"); onPicked: Shell.pick() } }", &options)
        .unwrap();
    assert_contains(&code, r#"import Badge from "./Badge.qml";"#);
    assert_contains(&code, r#"import { qsTr } from "ljos-web/runtime";"#);
    assert_contains(&code, r#"<Badge label={qsTr("a")} onPicked={() => Shell.pick()}></Badge>"#);
}
