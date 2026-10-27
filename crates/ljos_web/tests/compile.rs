//! What the lowering builds for Solid, and what Solid makes of it.

use ljos_web::{Options, compile, lowered_source};

fn options() -> Options {
    Options { name: "Sample".to_string(), ..Options::default() }
}

/// The types of a file come from what it imports.
fn tui(source: &str) -> String {
    format!("import OpenTUI\n{source}")
}

/// The tree handed to Solid's compiler, printed.
fn lowered(source: &str) -> String {
    lowered_source(&tui(source), &options()).unwrap_or_else(|errors| panic!("{errors:?}"))
}

fn js(source: &str) -> String {
    compile(&tui(source), &options()).unwrap_or_else(|errors| panic!("{errors:?}")).code
}

fn errors(source: &str) -> Vec<String> {
    let errors = compile(&tui(source), &options()).expect_err("expected the compile to fail");
    errors.into_iter().map(|error| error.message).collect()
}

#[track_caller]
fn assert_contains(haystack: &str, needle: &str) {
    assert!(haystack.contains(needle), "expected to find\n  {needle}\nin\n{haystack}");
}

#[test]
fn literals_fold_into_the_template() {
    let code = js(r#"Item {
    objectName: "box"
    flexDirection: "row"
    width: 20
    height: 3
    Text { text: "hello"; color: "red"; font.bold: true }
}"#);
    assert_contains(
        &code,
        "_$template(`<div class=q-item data-object-name=box style=flex-direction:row;width:20ch;height:3lh>\
         <span class=q-text style=color:red;font-weight:bold>hello`)",
    );
    // Nothing is left to do at run time.
    assert!(!code.contains("_$effect"), "{code}");
    assert!(!code.contains("qml-solid/runtime"), "{code}");
}

#[test]
fn bindings_become_grouped_effects() {
    let code = js(r#"Item {
    width: Shell.state.width
    Text { text: Shell.state.title; color: Theme.colors.text }
}"#);
    assert_contains(&code, r#"import { Shell, Theme } from "qml-solid/host";"#);
    assert_contains(&code, "_$insert(_el$2, () => {\n\t\treturn Shell.state.title;\n\t});");
    assert_contains(&code, r#"_$setStyleProperty(_el$, "width", "#);
    assert_contains(&code, r#"_$setStyleProperty(_el$2, "color", "#);
    assert_eq!(code.matches("_$effect(").count(), 1, "{code}");
    // A computed length gets its unit at run time.
    assert_contains(&code, "$ch(Shell.state.width)");
}

#[test]
fn property_kinds() {
    let code = lowered(r#"Item {
    id: panel
    readonly property int padding: 2
    readonly property var entry: Shell.state.entry
    readonly property string label: entry.name + "!"
    property int count: 0
    property string title: "Untitled"
    required property var item
    Text { text: label + padding + title + item.name; onMouseDown: count += 1 }
}"#);
    // A literal is a constant, so it can still fold into the template.
    assert_contains(&code, "const panel$padding = 2;");
    // A plain read needs no cache.
    assert_contains(&code, "const panel$entry = () => Shell.state.entry;");
    // A computation is cached, lazily so that declaration order cannot matter.
    assert_contains(
        &code,
        r#"const panel$label = createMemo(() => panel$entry().name + "!", { "lazy": true });"#,
    );
    // Assigned somewhere: a signal that follows its binding until it is set.
    assert_contains(
        &code,
        "const [panel$count, set$panel$count] = createSignal(() => props.count !== undefined ? props.count : 0);",
    );
    // The root's properties are the component's props.
    assert_contains(&code, r#"const panel$title = () => props.title !== undefined ? props.title : "Untitled";"#);
    assert_contains(&code, "const panel$item = () => props.item;");
    assert_contains(&code, "onMouseDown={() => set$panel$count(() => panel$count() + 1)}");
    assert_contains(&code, "{panel$label() + panel$padding + panel$title() + panel$item().name}");
}

#[test]
fn names_resolve_as_qml_scopes_them() {
    let source = |text: &str| {
        format!(
            r#"Item {{
    id: root
    readonly property string greeting: Shell.state.greeting
    Item {{
        id: inner
        readonly property string name: Shell.state.name
        readonly property string both: name + greeting
        Text {{ text: {text} }}
    }}
}}"#
        )
    };
    // An object sees its own properties, the component root's, and every id.
    let code = lowered(&source("greeting + root.greeting + inner.name"));
    assert_contains(&code, "{root$greeting() + root$greeting() + inner$name()}");
    assert_contains(&code, "createMemo(() => inner$name() + root$greeting()");
    // It does not see the properties of the objects in between.
    assert_eq!(errors(&source("name")), ["`name` is not defined"]);
}

#[test]
fn script_locals_shadow_qml_names() {
    let code = lowered(r#"Item {
    readonly property var rows: Shell.state.rows
    readonly property int total: rows.reduce((total, rows) => total + rows.size, 0)
}"#);
    assert_contains(&code, "root$rows().reduce((total, rows) => total + rows.size, 0)");
}

#[test]
fn repeater_over_a_list() {
    let code = lowered(r#"Item {
    Repeater {
        model: Shell.state.rows
        Text { objectName: "row-" + index; text: modelData.label }
    }
}"#);
    assert_contains(&code, "<For each={$model(Shell.state.rows)}>{($modelData, $index) =>");
    assert_contains(&code, r#"data-object-name={"row-" + $index()}"#);
    assert_contains(&code, "{$modelData.label}");
}

#[test]
fn repeater_over_a_count() {
    let code = lowered(r#"Item {
    Repeater {
        model: 3
        Text { text: index + ":" + modelData }
    }
}"#);
    assert_contains(&code, r#"<Repeat count={3}>{($index) => <span class="q-text">{$index + ":" + $index}</span>}</Repeat>"#);
}

#[test]
fn delegates_have_their_own_properties() {
    let code = js(r#"Item {
    Repeater {
        model: Shell.state.rows
        Item {
            id: row
            readonly property bool active: modelData.id === Shell.state.active
            Text { text: row.active ? ">" : " " }
        }
    }
}"#);
    assert_contains(&code, "children: ($modelData, $index) => {");
    assert_contains(&code, "const row$active = createMemo(() => $modelData.id === Shell.state.active");
}

#[test]
fn visible_toggles_display() {
    let code = js("Item { visible: Shell.state.open }");
    assert_contains(&code, r#"_$effect(() => Shell.state.open ? void 0 : "none""#);
    assert_contains(&code, r#"_$setStyleProperty(_el$, "display", "#);
    assert_contains(&js("Item { visible: false }"), "style=display:none");
    assert!(!js("Item { visible: true }").contains("display"));
}

#[test]
fn handlers_are_delegated() {
    let code = js(r#"Item {
    Text { text: "a"; onMouseDown: Shell.dispatch("a") }
    Text { text: "b"; onMouseDown: { Shell.dispatch("b"); Shell.dispatch("c") } }
    Text { text: "c"; onMouseDown: (event) => Shell.dispatch("d", event) }
}"#);
    assert_contains(&code, r#"._$$mousedown = () => Shell.dispatch("a");"#);
    assert_contains(&code, r#"._$$mousedown = (event) => Shell.dispatch("d", event);"#);
    assert_contains(&code, r#"_$delegateEvents(["mousedown"]);"#);
}

#[test]
fn component_instances() {
    let code = js(r#"Item {
    Badge { label: Shell.state.label; tone: "warn" }
}"#);
    assert_contains(&code, r#"import Badge from "./Badge.qml";"#);
    assert_contains(&code, "_$createComponent(Badge, {");
    assert_contains(&code, "get label() {");
    assert_contains(&code, r#"tone: "warn""#);
}

#[test]
fn typescript_syntax_is_erased() {
    let code = js(r#"Item {
    readonly property var entry: Shell.state.entry as Entry
    Text { text: (entry as Entry).name! }
}"#);
    assert_contains(&code, "const root$entry = () => Shell.state.entry;");
    assert_contains(&code, "return root$entry().name;");
}

#[test]
fn errors_are_reported_where_they_are() {
    let source = "import OpenTUI\nItem {\n    Text { text: missing }\n}";
    let errors = compile(source, &options()).unwrap_err();
    assert_eq!(errors.len(), 1);
    assert_eq!(errors[0].message, "`missing` is not defined");
    assert_eq!(errors[0].position(source), (3, 18));
}

#[test]
fn unsupported_qml_is_an_error_not_a_guess() {
    assert_eq!(errors("Item { TextInput {} }"), ["`TextInput` is not supported by the web target yet"]);
    assert_eq!(errors("Item { nope: 1 }"), ["`Item` has no property `nope` on the web target yet"]);
    assert!(!errors("Item { width: }").is_empty());
}
