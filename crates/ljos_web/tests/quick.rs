//! QtQuick: a file whose imports are Qt's becomes a module of the runtime's
//! components, its names settled when it is compiled.

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

fn lowered(source: &str) -> String {
    lowered_in(&[("Sample", source)], "Sample").unwrap_or_else(|errors| panic!("{errors:?}"))
}

fn errors(source: &str) -> Vec<String> {
    lowered_in(&[("Sample", source)], "Sample").unwrap_err()
}

#[track_caller]
fn assert_contains(haystack: &str, needle: &str) {
    assert!(haystack.contains(needle), "expected to find\n  {needle}\nin\n{haystack}");
}

#[track_caller]
fn assert_lacks(haystack: &str, needle: &str) {
    assert!(!haystack.contains(needle), "expected not to find\n  {needle}\nin\n{haystack}");
}

#[test]
fn an_object_is_a_component_of_the_runtime() {
    let code = lowered(
        r#"import QtQuick
Rectangle {
    id: root
    width: 200; color: "red"
    border { width: 2; color: "black" }
    Text { text: root.width; font.bold: true; anchors.fill: parent }
}"#,
    );
    assert_contains(&code, r#"import { $object } from "ljos-web/object";"#);
    assert_contains(&code, r#"import { Rectangle, Text } from "ljos-web/QtQuick";"#);
    assert_contains(&code, "export default function Sample($props) {");
    // An instance that has an id made the object already.
    assert_contains(&code, "const root = $props.$self ?? $object();");
    assert_contains(
        &code,
        r#"<Rectangle $self={root} $given={$props} $is={Sample} width={200} color={"red"} border$width={2} border$color={"black"}>"#,
    );
    // `parent` is the Text's: an object nothing else names gets a name of ours.
    assert_contains(&code, "const $1 = $object();");
    assert_contains(&code, "<Text $self={$1} text={root.width} font$bold={true} anchors$fill={$1.parent}>");
    // An instance's children go where the root's own do.
    assert_contains(&code, "</Text>{$props.children}</Rectangle>");
}

#[test]
fn only_an_object_something_names_has_a_binding() {
    let code = lowered("import QtQuick\nItem { Rectangle { width: 10 } Rectangle { width: height } }");
    assert_contains(&code, "<Rectangle width={10}></Rectangle>");
    assert_contains(&code, "<Rectangle $self={$3} width={$3.height}>");
    assert_lacks(&code, "const $2");
}

#[test]
fn what_an_object_declares_is_its_type() {
    let code = lowered(
        r#"import QtQuick
Item {
    id: clock
    property int hours
    property string city: "Oslo"
    property var anything
    property Item face
    property list<Item> hands
    property bool night: hours > 19
    signal ticked(int count)
    function tick() { hours = hours + 1; ticked(hours) }
    onTicked: (count) => console.log(count, city)
    onHoursChanged: tick()
}"#,
    );
    assert_contains(&code, "const Sample$ = {");
    // A property of a type says which, for what it is given to be made one.
    for property in ["hours: $int", "city: $string", "anything: void 0", "face: null", "hands: []", "night: $bool"] {
        assert_contains(&code, property);
    }
    assert_contains(&code, r#"signals: ["ticked"]"#);
    assert_contains(&code, "$declare={Sample$}");
    assert_contains(&code, r#"city={"Oslo"} night={clock.hours > 19}"#);
    // A function's names are the object's, and so is what it assigns to.
    assert_contains(&code, "clock.hours = clock.hours + 1;");
    assert_contains(&code, "clock.ticked(clock.hours);");
    assert_contains(&code, "onTicked={(count) => console.log(count, clock.city)}");
    assert_contains(&code, "onHoursChanged={() => clock.tick()}");
}

#[test]
fn a_handler_takes_what_its_signal_gives() {
    let code = lowered(
        r#"import QtQuick
MouseArea {
    onClicked: console.log(mouse.x)
    onPressed: { pressAndHoldInterval = mouse.y }
    onWheel: (wheel) => wheel.accepted = true
    onReleased: function(event) { console.log(event) }
    Keys.onPressed: (event) => event.accepted = true
    Keys.onReturnPressed: console.log(event.key)
    Component.onCompleted: console.log("made")
}"#,
    );
    assert_contains(&code, "onClicked={(mouse) => console.log(mouse.x)}");
    // `pressed` is a property too; the handler is the signal's.
    assert_contains(&code, "onPressed={(mouse) => {");
    assert_contains(&code, "$1.pressAndHoldInterval = mouse.y;");
    assert_contains(&code, "onWheel={(wheel) => wheel.accepted = true}");
    assert_contains(&code, "onReleased={function(event) {");
    assert_contains(&code, "Keys$onPressed={(event) => event.accepted = true}");
    assert_contains(&code, "Keys$onReturnPressed={(event) => console.log(event.key)}");
    assert_contains(&code, r#"Component$onCompleted={() => console.log("made")}"#);
    assert_contains(&code, "$attach={[Keys]}");
    assert_contains(&code, r#"import { Keys, MouseArea } from "ljos-web/QtQuick";"#);
}

#[test]
fn a_handler_of_a_change_is_given_what_qt_tells_it() {
    let code = lowered(
        r#"import QtQuick
import QtQuick.Templates as T
Item {
    id: root
    property int count: 0
    onCountChanged: (value) => console.log(value)
    onWidthChanged: (width) => console.log(width)
    onFocusChanged: (focus) => console.log(focus)
    onStateChanged: function(state) { console.log(state) }
    Text {
        onTextChanged: console.log(text)
        onFontChanged: console.log("changed")
        onLineHeightChanged: (height = 1) => console.log(height)
    }
    T.Button { id: button; action.onTextChanged: (text) => console.log(text) }
    MouseArea { onMouseXChanged: (mouse) => console.log(mouse.x) }
    PinchHandler { onScaleChanged: (delta) => console.log(delta) }
    Connections {
        target: button
        function onFocusChanged(focus) { console.log(focus) }
        function onWidthChanged(width) { console.log(width) }
    }
}"#,
    );
    // `focusChanged(bool)`, `stateChanged(string)`, `textChanged(string)`:
    // Qt's signal carries what the property now is. The runtime tells of a
    // change and of nothing more, so that is what the argument is then.
    assert_contains(&code, "onFocusChanged={(focus = root.focus) => console.log(focus)}");
    assert_contains(&code, "onStateChanged={function(state = root.state) {");
    assert_contains(&code, "onTextChanged={(text = $1.text) => console.log(text)}");
    // Of the object a property holds, too.
    assert_contains(&code, "action$onTextChanged={(text = button.action.text) => console.log(text)}");
    // And a Connections of a target it names by its id.
    assert_contains(&code, "onFocusChanged={function onFocusChanged(focus = button.focus) {");
    // `widthChanged()` carries nothing, nor does the change of a property
    // QML declares: an argument the handler names is undefined, as in Qt.
    assert_contains(&code, "onCountChanged={(value) => console.log(value)}");
    assert_contains(&code, "onWidthChanged={(width) => console.log(width)}");
    assert_contains(&code, "onWidthChanged={function onWidthChanged(width) {");
    // A script that does not name the argument is given none, and one that
    // says what it is without it keeps what it says.
    assert_contains(&code, r#"onFontChanged={(font) => console.log("changed")}"#);
    assert_contains(&code, "onLineHeightChanged={(height = 1) => console.log(height)}");
    // What Qt carries there is not the property: the event, by how much.
    assert_contains(&code, "onMouseXChanged={(mouse) => console.log(mouse.x)}");
    assert_contains(&code, "onScaleChanged={(delta) => console.log(delta)}");
}

#[test]
fn a_type_is_read_for_its_enums_and_for_what_it_attaches() {
    let code = lowered(
        r#"import QtQuick
import QtQuick.Layouts
Item {
    id: cell
    Layout.fillWidth: true
    width: ListView.view ? ListView.view.width : 0
    Text { style: Text.Raised; horizontalAlignment: Text.AlignHCenter; elide: Qt.ElideRight }
    ListView { orientation: ListView.Horizontal; snapMode: ListView.SnapMode.SnapOneItem }
}"#,
    );
    assert_contains(&code, "Layout$fillWidth={true}");
    assert_contains(&code, "$attach={[Layout]}");
    assert_contains(&code, r#"import { Layout } from "ljos-web/QtQuick/Layouts";"#);
    assert_contains(&code, "width={ListView.attached(cell).view ? ListView.attached(cell).view.width : 0}");
    assert_contains(&code, "style={Text$Raised} horizontalAlignment={Text$AlignHCenter} elide={Qt$ElideRight}");
    assert_contains(&code, "orientation={ListView$Horizontal} snapMode={ListView$SnapOneItem}");
    assert_contains(&code, "const ListView$SnapOneItem = ListView.SnapOneItem;");
    assert_contains(&code, r#"import { Qt } from "ljos-web/QtQml";"#);
}

#[test]
fn a_request_is_qmls_not_the_browsers() {
    // QML's XMLHttpRequest says nothing of a header no program may set, and
    // finds what a `qrc:` address names.
    let code = lowered(
        r#"import QtQuick
Item {
    function ask(url) {
        const request = new XMLHttpRequest()
        request.open("GET", url)
        request.send()
    }
}"#,
    );
    assert_contains(&code, r#"import { XMLHttpRequest } from "ljos-web/QtQml";"#);
}

#[test]
fn a_url_a_block_works_out_is_beside_its_file() {
    // `source: { if (red) "gfx/red.png"; else "gfx/blue.png" }` names files
    // beside the QML as `source: red ? "gfx/red.png" : "gfx/blue.png"` does.
    let code = lowered(
        r#"import QtQuick
Image {
    property bool red: true
    source: {
        if (red) {
            "gfx/red.png";
        } else {
            "gfx/blue.png";
        }
    }
}"#,
    );
    assert_contains(&code, "source={$url((() => {");
    assert_contains(&code, "})(), import.meta.url)}");
}

#[test]
fn what_a_type_attaches_is_read_of_another_object_too() {
    let code = lowered(
        r#"import QtQuick
import QtQuick.Window as W
Item {
    id: cell
    Text {
        visible: cell.ListView.isCurrentItem && W.Window.active
        flags: Qt.Window
        Keys.onPressed: cell.parent.ListView.delayRemove = true
    }
}"#,
    );
    assert_contains(&code, "visible={ListView.attached(cell).isCurrentItem && W.Window.attached($1).active}");
    assert_contains(&code, "flags={Qt.Window}");
    assert_contains(&code, "ListView.attached(cell.parent).delayRemove = true");
    assert_contains(&code, r#"import { Item, Keys, ListView, Text } from "ljos-web/QtQuick";"#);
}

#[test]
fn a_path_view_attaches_what_its_path_names() {
    let code = lowered(
        r#"import QtQuick
PathView {
    snapMode: PathView.SnapToItem
    delegate: Item {
        id: cell
        scale: PathView.iconScale
        Text { opacity: cell.PathView.fade; visible: PathView.onPath }
    }
}"#,
    );
    assert_contains(&code, "snapMode={PathView$SnapToItem}");
    assert_contains(&code, "scale={PathView.attached(cell).iconScale}");
    assert_contains(&code, "opacity={PathView.attached(cell).fade}");
}

#[test]
fn a_delegate_is_a_function_of_what_it_is_given() {
    let code = lowered(
        r#"import QtQuick
Item {
    id: root
    property int spacing: 4
    Component { id: dot; Rectangle { width: 4; radius: spacing } }
    Repeater {
        model: 3
        Rectangle {
            required property int index
            x: index * root.spacing; y: modelData + spacing; z: model.index
            Repeater { model: 2; delegate: Text { text: index + name } }
        }
    }
    ListView { delegate: dot; highlight: Rectangle { color: "blue" } }
    Loader { sourceComponent: dot }
}"#,
    );
    // A `Component` with an id is a binding of the component it is in.
    assert_contains(&code, "const dot = $component(($data) => {");
    assert_contains(&code, r#"radius={"spacing" in $data ? $data.spacing : root.spacing}"#);
    // What is written in a Repeater is its delegate.
    assert_contains(&code, "<Repeater model={3} delegate={$component(($data) => {");
    // A required property is what the delegate is given; another name is the
    // object's if it has it, a role of the model's if not.
    assert_contains(&code, "index={$data.index}");
    assert_contains(&code, "x={$3.index * root.spacing}");
    assert_contains(&code, r#"y={$data.modelData + ("spacing" in $data ? $data.spacing : root.spacing)}"#);
    assert_contains(&code, "z={$data.model.index}");
    // A delegate in a delegate is given its own, and sees the other's.
    assert_contains(&code, "delegate={$component(($data1) => {");
    assert_contains(&code, r#"text={$data1.index + ("name" in $data1 ? $data1.name : $data.name)}"#);
    assert_contains(&code, "<ListView delegate={dot} highlight={$component(($data) => {");
    assert_contains(&code, "<Loader sourceComponent={dot}>");

    // A component a type attaches is one too: what a view edits a cell with.
    let code = lowered("import QtQuick\nItem {\n    TableView.editDelegate: Text { text: column }\n}");
    assert_contains(&code, "TableView$editDelegate={$component(($data) => {");
    assert_contains(&code, "text={$data.column}");
}

#[test]
fn a_delegate_is_given_what_its_type_requires() {
    // What Qt's type requires in C++, and what a style's requires in QML.
    let code = lowered(
        r#"import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Templates as T
Item {
    TableView { delegate: TableViewDelegate { } }
    TableView { delegate: T.TableViewDelegate { required property int row; selected: false } }
    HorizontalHeaderView { delegate: T.HeaderViewDelegate { } }
    TableViewDelegate { }
}"#,
    );
    assert_contains(
        &code,
        "<TableViewDelegate column={$data.column} row={$data.row} model={$data.model} tableView={$data.tableView} \
         current={$data.current} selected={$data.selected} editing={$data.editing}></TableViewDelegate>",
    );
    // What the delegate sets is not given.
    assert_contains(
        &code,
        "<T.TableViewDelegate selected={false} row={$data.row} tableView={$data.tableView} current={$data.current} \
         editing={$data.editing}",
    );
    assert_contains(&code, "<T.HeaderViewDelegate headerView={$data.headerView} model={$data.model} tableView={$data.tableView}");
    // One that is not a delegate is given nothing.
    assert_contains(&code, "<TableViewDelegate></TableViewDelegate>");

    // A component has what the type of its root requires, with its own.
    let app = "import QtQuick\nTableView { delegate: Cell { } }";
    let cell = "import QtQuick.Templates as T\nT.TableViewDelegate { required property var model }";
    let code = lowered_in(&[("App", app), ("Cell", cell)], "App").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(
        &code,
        "<Cell model={$data.model} tableView={$data.tableView} current={$data.current} selected={$data.selected} \
         editing={$data.editing}></Cell>",
    );
}

#[test]
fn a_name_that_is_the_files_and_not_capitalised_is_what_qml_has_by_it() {
    // The module binds `sample` to the component; to QML it is no type.
    let code = lowered_in(
        &[("sample", "import QtQuick\nItem { id: root; property int sample: 1; function read() { return sample } }")],
        "sample",
    )
    .unwrap();
    assert_contains(&code, "return root.sample");
}

#[test]
fn a_path_is_taken_from_the_file_of_what_uses_it() {
    let files = [
        (
            "Sample",
            r#"import QtQuick
import "parts"
Item {
    Picture { source: "a.png"; sourceSize.width: 10 }
    Held { shown: "b.png" }
    Shot { source: "c.png" }
    Image { source: "d.png" }
}"#,
        ),
        ("parts/Picture", "import QtQuick\nItem { property alias source: image.source; property alias sourceSize: image.sourceSize; Image { id: image } }"),
        ("parts/Held", "import QtQuick\nItem { id: root; property url shown; Image { source: root.shown } }"),
        ("parts/Shot", "import QtQuick\nImage {}"),
    ];
    // An alias is what it is an alias of, a path or a group; the path is
    // taken from the file that has the object, and one given to a property
    // a component declares from the component's.
    let code = lowered_in(&files, "Sample").unwrap();
    assert_contains(&code, r#"new URL("parts/a.png", import.meta.url)"#);
    assert_contains(&code, r#"new URL("parts/b.png", import.meta.url)"#);
    assert_contains(&code, r#"new URL("c.png", import.meta.url)"#);
    assert_contains(&code, r#"new URL("d.png", import.meta.url)"#);
    assert_contains(&code, "sourceSize$width={10}");

    // `QML_COMPAT_RESOLVE_URLS_ON_ASSIGNMENT`: from the file it is written in.
    let mut project = Project::new();
    for (file, source) in files {
        project.add(file, source).unwrap();
    }
    let options =
        Options { name: "Sample".to_string(), project: Some(project), urls_on_assignment: true, ..Options::default() };
    let code = lowered_source(files[0].1, &options).unwrap();
    assert_contains(&code, r#"new URL("a.png", import.meta.url)"#);
    assert_contains(&code, r#"new URL("b.png", import.meta.url)"#);

    // What stands in for a type in C++ takes it as that type does: from the
    // file that makes the object.
    let mut project = Project::new();
    for (file, source) in files {
        project.add(file, source).unwrap();
    }
    project.stand_in("parts/Held");
    let options = Options { name: "Sample".to_string(), project: Some(project), ..Options::default() };
    let code = lowered_source(files[0].1, &options).unwrap();
    assert_contains(&code, r#"new URL("parts/a.png", import.meta.url)"#);
    assert_contains(&code, r#"new URL("b.png", import.meta.url)"#);
}

#[test]
fn an_alias_is_a_path_to_the_object_that_has_the_property() {
    let code = lowered(
        r#"import QtQuick
Rectangle {
    property alias text: label.text
    property alias bold: label.font.bold
    property alias label: label
    default property alias content: body.data
    Text { id: label }
    Item { id: body }
}"#,
    );
    assert_contains(&code, r#"text: [label, "text"]"#);
    assert_contains(&code, r#"bold: [
			label,
			"font",
			"bold"
		]"#);
    assert_contains(&code, "label: [label]");
    // What an instance has inside it goes in the object the default alias names.
    assert_contains(&code, "<Item $self={body}>{$props.children}</Item></Rectangle>");
    assert_eq!(
        errors("import QtQuick\nItem { property alias text: nobody.text }"),
        [
            "`nobody` is not an id in this component",
            "`text` is an alias of nothing: an alias names an id, or a property of one"
        ]
    );
}

#[test]
fn objects_go_where_values_do() {
    let code = lowered(
        r#"import QtQuick
Item {
    id: item
    transform: Rotation { angle: 45; origin.x: 10 }
    states: [
        State { name: "a"; PropertyChanges { target: item; x: 10; anchors.margins: width } },
        State { name: "b"; PropertyChanges { item.opacity: 0.5 } }
    ]
    transitions: Transition { NumberAnimation { properties: "x" } }
    Behavior on x { NumberAnimation { duration: 100 } }
    NumberAnimation on anchors.margins { to: 4 }
    Connections { target: item; function onXChanged() { console.log(x) } }
    ListModel { ListElement { name: "a"; cost: 2 } }
}"#,
    );
    // A list property is a list, however many objects are written.
    assert_contains(&code, "transform={[<Rotation angle={45} origin$x={10}></Rotation>]}");
    assert_contains(
        &code,
        r#"<PropertyChanges target={item} $changes={[["x", () => 10], ["anchors.margins", () => item.width]]}>"#,
    );
    assert_contains(&code, r#""opacity","#);
    assert_contains(&code, "() => item");
    assert_contains(&code, "transitions={[<Transition>");
    assert_contains(&code, r#"<Behavior $target={item} $property="x">"#);
    assert_contains(&code, r#"<NumberAnimation $target={item} $property="anchors$margins" to={4}>"#);
    assert_contains(&code, "<Connections target={item} onXChanged={function onXChanged() {");
    assert_contains(&code, r#"<ListModel><ListElement name={"a"} cost={2}></ListElement></ListModel>"#);
}

#[test]
fn a_baked_shader_is_the_builds_to_make() {
    let code = lowered(
        r#"import QtQuick
Item {
    ShaderEffect { fragmentShader: "shaders/wave.frag.qsb"; vertexShader: "../wave.vert.qsb" }
    ShaderEffect { fragmentShader: "shaders/wave.frag.qsb" }
    ShaderEffect { fragmentShader: "qrc:/shaders/wave.frag.qsb" }
}"#,
    );
    assert_contains(&code, r#"import $url1 from "./shaders/wave.frag.qsb";"#);
    assert_contains(&code, r#"import $url2 from "../wave.vert.qsb";"#);
    assert_contains(&code, "<ShaderEffect fragmentShader={$url1} vertexShader={$url2}>");
    assert_contains(&code, "<ShaderEffect fragmentShader={$url1}>");
    assert_contains(&code, r#"<ShaderEffect fragmentShader={"qrc:/shaders/wave.frag.qsb"}>"#);
}

#[test]
fn a_path_is_taken_from_the_file() {
    let code = lowered(
        r#"import QtQuick
Item {
    property url icon: "icons/a.png"
    Image { source: "images/clock.png" }
    Image { source: "images/clock.png" }
    Image { source: "https://example.org/a.png" }
    Image { source: icon }
    Loader { source: "Other.qml" }
    property url folder: "icons/"
    property url other: Qt.resolvedUrl("images/")
}"#,
    );
    // A directory is not for a bundler to take for a file.
    assert_contains(&code, r#"const $url3 = $url("icons/", import.meta.url);"#);
    assert_contains(&code, r#"other={$url("images/", import.meta.url)}"#);
    assert_contains(&code, r#"const $url1 = new URL("icons/a.png", import.meta.url).href;"#);
    assert_contains(&code, r#"const $url2 = new URL("images/clock.png", import.meta.url).href;"#);
    assert_lacks(&code, "$url4");
    assert_contains(&code, "icon={$url1}");
    assert_contains(&code, "<Image source={$url2}></Image><Image source={$url2}></Image>");
    assert_contains(&code, r#"<Image source={"https://example.org/a.png"}>"#);
    assert_contains(&code, "<Image source={$url($1.icon, import.meta.url)}>");
    // A QML file is the component it was compiled to.
    assert_contains(&code, r#"import $file1 from "./Other.qml";"#);
    assert_contains(&code, "<Loader source={$file($file1)}>");
}

#[test]
fn a_text_of_qml_is_a_component_declared_by_the_file() {
    let code = lowered_in(
        &[
            (
                "Sample",
                r#"import QtQuick
Item {
    id: root
    property string shade: "blue"
    function make(name) {
        const a = Qt.createQmlObject('import QtQuick; Rectangle { width: 30; height: width * 2 }', root)
        const b = Qt.createQmlObject('import QtQuick; Text { text: "it is ' + name + '"; color: root.shade }', a)
        const c = Qt.createQmlObject(`import QtQuick.Controls
            Tile { Button { } Sample { } }`, b)
        return Qt.createQmlObject(name, root)
    }
}"#,
            ),
            ("Tile", "import QtQuick\nItem { }"),
        ],
        "Sample",
    )
    .unwrap();
    // What the text imports is imported with what the file does, once.
    assert_contains(&code, r#"import { Item, Rectangle, Text } from "ljos-web/QtQuick";"#);
    assert_contains(&code, r#"import { Button } from "ljos-web/QtQuick/Controls";"#);
    assert_contains(&code, r#"import Tile from "./Tile.qml";"#);
    assert_lacks(&code, r#"from "./Sample.qml""#);
    assert_contains(
        &code,
        "const $text1 = (() => {
	function Sample$text1($props) {
		const $1 = $props.$self ?? $object();
		return <Rectangle $self={$1} $given={$props} $is={Sample$text1} width={30} height={$1.width * 2}>{$props.children}</Rectangle>;
	}
	Object.setPrototypeOf(Sample$text1, Rectangle);
	return Sample$text1;
})();",
    );
    // A text put together is one of what was put into it; a name it does
    // not declare is found where the file giving it finds its own.
    assert_contains(&code, "const $text2 = ($hole1) => {");
    assert_contains(&code, r#"text={"it is " + $hole1} color={$lookup($scope, "root").shade}"#);
    assert_contains(&code, "<Button></Button><Sample $context={$scope}></Sample>");
    assert_contains(&code, "const a = $file($text1, $scope).createObject(root);");
    assert_contains(&code, "const b = $file($text2(name), $scope).createObject(a);");
    assert_contains(&code, "const c = $file($text3, $scope).createObject(b);");
    // A text nothing of which is written is left to the runtime to refuse.
    assert_contains(&code, "return Qt.createQmlObject(name, root);");
}

#[test]
fn a_text_of_qml_that_cannot_be_compiled_is_an_error_where_it_is_written() {
    let within = |text: &str| {
        errors(&format!("import QtQuick\nimport QtQuick.Controls.Material\nItem {{\n    id: root\n    Button {{ }}\n    function make(n) {{ return Qt.createQmlObject({text}, root) }}\n}}"))
    };
    assert_eq!(within("'import QtQuick; Rectangle { width: ; }'"), ["Unexpected token"]);
    assert_eq!(
        within("'import QtQuick; Rectangle { width: ' + n + ' }'"),
        ["what is put into a text given to `Qt.createQmlObject` can only be put into a string of it yet"]
    );
    assert_eq!(
        within("'import QtQuick.Controls.Fusion; Button { }'"),
        ["`Button` is one thing to the file and another to the text given to `Qt.createQmlObject`"]
    );
    assert_eq!(
        within("'pragma Singleton; import QtQuick; Item { }'"),
        ["a text given to `Qt.createQmlObject` is no singleton"]
    );
    assert_eq!(within("'import QtQuick; Nothing { }'"), ["`Nothing` is not a type of anything the file imports"]);
}

/// The lowering of `source`, with `files` in its directory and under it.
fn lowered_among(source: &str, files: &[&str]) -> String {
    let mut project = Project::new();
    project.add("Sample", source).unwrap_or_else(|errors| panic!("{errors:?}"));
    let options = Options {
        name: "Sample".to_string(),
        project: Some(project),
        files: Some(files.iter().map(ToString::to_string).collect()),
        ..Options::default()
    };
    compile(source, &options).unwrap_or_else(|errors| panic!("{errors:?}"));
    lowered_source(source, &options).unwrap_or_else(|errors| panic!("{errors:?}"))
}

#[test]
fn a_path_of_a_qml_file_is_the_component() {
    let code = lowered_among(
        r#"import QtQuick
Item {
    id: root
    property string page: "Home"
    property var made: Qt.createComponent("parts/Dial.qml")
    property var other: Qt.createComponent("QtQuick", "Rectangle")
    property url icon: Qt.resolvedUrl("icons/a.png")
    property url where: Qt.resolvedUrl(page)
    property string first: "pages/Home.qml"
    Text { text: "pages/About.qml" }
    Loader { id: loader; source: "pages/" + root.page + ".qml" }
    function open(name) {
        loader.source = "pages/Home.qml"
        loader.source = `pages/${name}.qml`
        console.log("Nowhere.qml", name + ".txt", "themes/" + name + ".qml", { "pages/Home.qml": 1 })
        return Qt.createComponent(name)
    }
}"#,
        &["Sample.qml", "pages/About.qml", "pages/Home.qml", "parts/Dial.qml"],
    );
    assert_contains(&code, r#"import { $file, $files, $object, $string, $url } from "ljos-web/object";"#);
    // Nothing is left for `Qt` to make as the program runs.
    assert_lacks(&code, r#"from "ljos-web/QtQml""#);
    assert_contains(&code, r#"import $file1 from "./parts/Dial.qml";"#);
    assert_contains(&code, r#"import $file2 from "./pages/Home.qml";"#);
    assert_contains(&code, "$file($file1)");
    // A type of a module, by their names, is the component the module has.
    assert_contains(&code, r#"import { Item, Loader, Rectangle, Text } from "ljos-web/QtQuick";"#);
    assert_contains(&code, "other={$file(Rectangle)}");
    assert_contains(&code, r#"icon={new URL("icons/a.png", import.meta.url).href}"#);
    assert_contains(&code, "where={$url(root.page, import.meta.url)}");
    // A path put together is one of the files it could be.
    assert_contains(
        &code,
        r#"const $files1 = $files({
	"pages/About.qml": () => $file3,
	"pages/Home.qml": () => $file2
}, import.meta.url);"#,
    );
    assert_contains(&code, r#"source={$url($files1("pages/" + root.page + ".qml"), import.meta.url)}"#);
    assert_contains(&code, "loader.source = $file($file2);");
    assert_contains(&code, "loader.source = $files1(`pages/${name}.qml`);");
    // So is the text of a string, which holds the name and not the file.
    assert_contains(&code, r#"first={"pages/Home.qml"}"#);
    assert_contains(&code, r#"<Text text={"pages/About.qml"}>"#);
    // What names no file is what was written.
    assert_contains(&code, r#"console.log("Nowhere.qml", name + ".txt", "themes/" + name + ".qml", { "pages/Home.qml": 1 });"#);
    // Asked of Qt, it is a component whatever it names: all of them could be.
    assert_contains(&code, "return $files2(name, true);");
    assert_contains(&code, r#""Sample.qml": () => $file4"#);
}

#[test]
fn a_script_is_the_module_its_import_is() {
    let options = Options {
        files: Some(vec!["Block.qml".to_string(), "towers/Melee.qml".to_string()]),
        ..Options::default()
    };
    let code = ljos_web::compile_script(
        r#".pragma library // Shared
.import QtQuick as QQ
.import "other.js" as Other
var board = new Array(10);
var board;
let block = Qt.createComponent("Block.qml");
function tower(name) {
    var made = Qt.createComponent("towers/" + name + ".qml");
    if (made.status == QQ.Component.Error) console.log(qsTr("no %1").arg(name), Other.why());
    return made;
}
board[0] = tower("Melee");
"#,
        &options,
    )
    .unwrap_or_else(|errors| panic!("{errors:?}"))
    .code;
    assert_contains(&code, r#"import { $file, $files } from "ljos-web/object";"#);
    // Only what is still named: `Qt` was only asked for components.
    assert_contains(&code, r#"import { qsTr } from "ljos-web/QtQml";"#);
    assert_contains(&code, r#"import * as QQ from "ljos-web/QtQuick";"#);
    assert_contains(&code, r#"import * as Other from "./other.js";"#);
    assert_contains(&code, r#"import $file1 from "./Block.qml";"#);
    assert_contains(&code, "const $files1 = $files({ \"towers/Melee.qml\": () => $file2 }, import.meta.url);");
    assert_contains(&code, "export var board = new Array(10);\nvar board;");
    assert_contains(&code, "export let block = $file($file1);");
    assert_contains(&code, "export function tower(name) {");
    assert_contains(&code, r#"var made = $files1("towers/" + name + ".qml", true);"#);
    assert_lacks(&code, ".pragma library\n");

    let failed = |source: &str| {
        ljos_web::compile_script(source, &Options::default()).unwrap_err().remove(0).message
    };
    assert_eq!(failed(".pragma library\nfunction area() { return width * height; }"), "`width` is not defined");
    assert_contains(&failed("function area() { return width; }"), "a script that is not a library takes it from the object");
    assert_contains(&failed(".pragma strict\n"), "the only pragma");
}

const CLOCK: &str = r#"import QtQuick
Item {
    id: clock
    property string city
    required property real shift
    signal struck(int hour)
    Text { text: clock.city }
}"#;

#[test]
fn a_file_is_a_component_of_the_files_that_name_it() {
    let app = r#"import QtQuick
import "parts"
Item {
    component Dot: Rectangle { property int size: 4; width: size }
    Clock { id: one; city: "Oslo"; shift: 1; onStruck: console.log(hour, city) }
    Dot { size: 8 }
    Hand { length: one.shift }
    ListView { delegate: Clock { required city } }
}"#;
    let hand = "import QtQuick\nRectangle { property real length }";
    let files = [("App", app), ("Clock", CLOCK), ("parts/Hand", hand)];
    let code = lowered_in(&files, "App").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, r#"import Clock from "./Clock.qml";"#);
    assert_contains(&code, r#"import Hand from "./parts/Hand.qml";"#);
    // An inline component is a function of the module.
    assert_contains(&code, "function Dot($props) {");
    assert_contains(&code, "<Dot size={8}></Dot>");
    // The signal's arguments and the properties are the component's.
    assert_contains(&code, r#"<Clock $self={one} city={"Oslo"} shift={1} onStruck={(hour) => console.log(hour, one.city)}>"#);
    assert_contains(&code, "<Hand length={one.shift}></Hand>");
    // What a component requires is what its delegate is given.
    assert_contains(&code, "<Clock city={$data.city} shift={$data.shift}></Clock>");

    // A file in a directory names the files around it by their path from it.
    let hand = "import QtQuick\nimport \"..\"\nClock { }";
    let files = [("App", app), ("Clock", CLOCK), ("parts/Hand", hand)];
    let code = lowered_in(&files, "parts/Hand").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, r#"import Clock from "../Clock.qml";"#);
    assert_contains(&code, "export default function Hand($props) {");
}

#[test]
fn a_module_may_be_imported_as_a_name() {
    let code = lowered(
        "import QtQuick\nimport QtQuick.Controls as C\nimport \"lib.js\" as Lib\nItem { C.Button { text: Lib.title(C.Button.Ok) } }",
    );
    assert_contains(&code, r#"import * as C from "ljos-web/QtQuick/Controls";"#);
    assert_contains(&code, r#"import * as Lib from "./lib.js";"#);
    assert_contains(&code, "<C.Button text={Lib.title(C.Button.Ok)}></C.Button>");
}

#[test]
fn a_name_nothing_has_is_an_error() {
    assert_eq!(errors("import QtQuick\nItem { width: nope }"), ["`nope` is not defined"]);
    assert_eq!(errors("import QtQuick\nItem { width: Nope.size }"), ["`Nope` is not defined"]);
    assert_eq!(
        errors("import QtQuick\nItem { Nope { } }"),
        ["`Nope` is not a type of anything the file imports"]
    );
}

#[test]
fn a_name_of_whatever_made_the_component_is_found_as_it_runs() {
    let files = [
        (
            "Sample",
            r#"import QtQuick
Item {
    id: board
    property int __cell: 8
    component Dot: Rectangle { width: board.width / 2; height: __cell }
    Dot { }
    Row { id: row; Tile { } }
}"#,
        ),
        ("Tile", "import QtQuick\nItem {\n    width: row.spacing\n    Mark { }\n}"),
        ("Mark", "import QtQuick\nItem { id: mark; width: board.width }"),
    ];
    let code = lowered_in(&files, "Sample").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, r#"import { $context, $int, $lookup, $object } from "ljos-web/object";"#);
    // An inline component is a component of its own: the file's ids are
    // those of whatever makes it, which is not always the file.
    assert_contains(&code, "const $scope1 = $context($props.$context, $1);");
    assert_contains(&code, r#"width={$lookup($scope1, "board").width / 2}"#);
    assert_contains(&code, r#"height={$lookup($scope1, "__cell")}"#);
    // What the file has to be found: the ids something else names, and its
    // root for what that declares.
    assert_contains(&code, "const $scope = $context($props.$context, board, () => ({\n\t\tboard,\n\t\trow\n\t}));");
    assert_contains(&code, "<Dot $context={$scope}></Dot>");
    assert_contains(&code, "<Tile $context={$scope}></Tile>");

    // A component between the two passes on where it was made.
    let code = lowered_in(&files, "Tile").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, "const $scope = $context($props.$context, $1);");
    assert_contains(&code, r#"width={$lookup($scope, "row").spacing}"#);
    assert_contains(&code, "<Mark $context={$scope}></Mark>");

    // One that makes nothing has nothing to pass on, only something to find.
    let code = lowered_in(&files, "Mark").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, "const $scope = $context($props.$context, mark);");
    assert_contains(&code, r#"width={$lookup($scope, "board").width}"#);

    // A project that does none of this pays nothing for it.
    let code = lowered_in(
        &[("Sample", "import QtQuick\nItem { id: board\n Tile { } }"), ("Tile", "import QtQuick\nItem { width: 2 }")],
        "Sample",
    )
    .unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_lacks(&code, "$context");
    assert_lacks(&code, "$scope");
    // And a name no component has is still an error.
    assert_eq!(
        lowered_in(&[("Sample", "import QtQuick\nItem { component Dot: Item { width: board.width } }")], "Sample")
            .unwrap_err(),
        ["`board` is not defined"]
    );
}

#[test]
fn solid_makes_the_objects() {
    let options = Options { name: "Sample".to_string(), ..Options::default() };
    let code = compile("import QtQuick\nItem { id: root\n Rectangle { width: root.width; height: 4 } }", &options)
        .unwrap_or_else(|errors| panic!("{errors:?}"))
        .code;
    assert_contains(&code, r#"import { createComponent as _$createComponent } from "solid-js";"#);
    // A binding is a getter, a value a value: the object decides when to read.
    assert_contains(&code, "get width() {\n\t\t\t\t\treturn root.width;\n\t\t\t\t},\n\t\t\t\theight: 4");
    assert_lacks(&code, "_$memo");
}

#[test]
fn an_enum_is_keys_on_the_component() {
    let files = [
        (
            "Sample",
            r#"import QtQuick
Item {
    property int theme: Swatch.Theme.Dark
    property int mine: Sample.Narrow
    enum Width { Wide, Narrow = 4 }
    component Chip: Item { enum Shape { Round, Square } }
    Swatch { tone: Swatch.Light }
}"#,
        ),
        ("Swatch", "import QtQuick\nItem {\n    property int tone\n    enum Theme { Light, Dark }\n}"),
    ];
    let code = lowered_in(&files, "Sample").unwrap_or_else(|errors| panic!("{errors:?}"));
    // `Type.Enum.Key` and `Type.Key` are the same key, as they are in Qt's types.
    assert_contains(&code, "const Swatch$Dark = Swatch.Dark;");
    assert_contains(&code, "theme={Swatch$Dark}");
    assert_contains(&code, "tone={Swatch$Light}");
    // The file is a type to itself too, and is not imported for it.
    assert_contains(&code, "const Sample$Narrow = Sample.Narrow;");
    assert_contains(&code, "mine={Sample$Narrow}");
    assert_lacks(&code, "import Sample");
    assert_contains(&code, "Object.assign(Sample, {\n\tWide: 0,\n\tNarrow: 4\n});");
    assert_contains(&code, "Object.assign(Chip, {\n\tRound: 0,\n\tSquare: 1\n});");

    let code = lowered_in(&files, "Swatch").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, "export default function Swatch($props) {");
    assert_contains(&code, "Object.assign(Swatch, {\n\tLight: 0,\n\tDark: 1\n});");
}

#[test]
fn an_enum_a_qml_file_of_qts_declares_is_keys_on_the_type() {
    let files = [
        (
            "Sample",
            r#"import QtQuick
import QtQuick3D
import QtQuick3D.Helpers as Helpers
import QtQuick3D.Helpers
View3D {
    property int level: ExtendedSceneEnvironment.GlowLevel.One | Helpers.ExtendedSceneEnvironment.GlowLevel.Two
    property int mode: Swatch.Blend.Screen
    environment: ExtendedSceneEnvironment {
        glowBlendMode: ExtendedSceneEnvironment.GlowBlendMode.Screen
    }
}"#,
        ),
        ("Swatch", "import QtQuick\nItem {\n    enum Blend { Additive, Screen }\n}"),
    ];
    let code = lowered_in(&files, "Sample").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, "level={ExtendedSceneEnvironment.One | Helpers.ExtendedSceneEnvironment.Two}");
    // A key with the name of a type that attaches is a key all the same.
    assert_contains(&code, "glowBlendMode={ExtendedSceneEnvironment.Screen}");
    assert_contains(&code, "const Swatch$Screen = Swatch.Screen;");
    assert_lacks(&code, "attached");
}

#[test]
fn a_component_has_what_the_type_of_its_root_has() {
    let files = [
        (
            "Sample",
            r#"import QtQuick
Item {
    component Chip: Caption { }
    Caption { elide: Caption.ElideRight }
}"#,
        ),
        ("Caption", "import QtQuick\nText { }"),
    ];
    // `Caption.ElideRight` is a key of Text, which the runtime has and we do
    // not: the component is read for it as Text would be.
    let code = lowered_in(&files, "Sample").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, "const Caption$ElideRight = Caption.ElideRight;");
    assert_contains(&code, "elide={Caption$ElideRight}");
    assert_contains(&code, "Object.setPrototypeOf(Sample, Item);");
    assert_contains(&code, "Object.setPrototypeOf(Chip, Caption);");

    let code = lowered_in(&files, "Caption").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, "Object.setPrototypeOf(Caption, Text);");

    // A type of a namespace is the root of Qt's own controls.
    let code = lowered("import QtQuick as Q\nQ.Item { }");
    assert_contains(&code, "Object.setPrototypeOf(Sample, Q.Item);");

    // A singleton is an object, and its name has the keys of its type all
    // the same: it is the name that is read for them, not the function.
    let files = [("Theme", "pragma Singleton\nimport QtQuick\nQtObject { }")];
    let code = lowered_in(&files, "Theme").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, "Object.setPrototypeOf(Theme, QtObject);");
    assert_lacks(&code, "setPrototypeOf(Theme$component");
}

#[test]
fn a_singleton_has_the_keys_of_the_type_of_its_root() {
    let files = [
        (
            "Sample",
            r#"import QtQuick
Item {
    property int last: Almanac.December
    property int march: Almanac.Month.March
    property int after: Almanac.Era.After
    property int kind: Solo.Kind.B
    property int first: Almanac.firstYear
    function wraps(month) { return month === Almanac.December || month === Solo.B }
}"#,
        ),
        (
            "Almanac",
            r#"pragma Singleton
import QtQuick
import QtQuick.Templates as T
T.Calendar {
    property int firstYear: 1970
    enum Era { Before, After = 7 }
}"#,
        ),
        ("Base", "import QtQuick\nItem { enum Kind { A, B } }"),
        ("Solo", "pragma Singleton\nimport QtQuick\nBase { }"),
    ];
    // `Calendar.December` of QtQuick.Controls, whose `Calendar` is the one
    // `T.Calendar`: a key is read off the name, and the object is not made
    // for it.
    let code = lowered_in(&files, "Sample").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, "const Almanac$December = Almanac.December;");
    assert_contains(&code, "const Almanac$March = Almanac.March;");
    assert_contains(&code, "const Almanac$After = Almanac.After;");
    assert_contains(&code, "month === Almanac.December || month === Solo.B");
    // The keys of a component its root is, too.
    assert_contains(&code, "const Solo$B = Solo.B;");
    // What is not a key is the object's.
    assert_contains(&code, "first={Almanac().firstYear}");

    let code = lowered_in(&files, "Almanac").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, "const Almanac = $singleton(Almanac$component, {\n\tBefore: 0,\n\tAfter: 7\n});");
    assert_contains(&code, "Object.setPrototypeOf(Almanac, T.Calendar);");
    let code = lowered_in(&files, "Solo").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, "Object.setPrototypeOf(Solo, Base);");
}

#[test]
fn a_singleton_is_one_object_reached_through_its_name() {
    let files = [
        (
            "Sample",
            r#"import QtQuick
Item {
    width: Units.grid * 2
    height: Units.Small
    property var units: Units
    function reset() { Units.grid = 8 }
}"#,
        ),
        (
            "Units",
            r#"pragma Singleton
import QtQuick
QtObject {
    property int grid: 8
    property int twice: Units.grid * 2
    enum Size { Small, Large }
}"#,
        ),
    ];
    let code = lowered_in(&files, "Sample").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, r#"import Units from "./Units.qml";"#);
    // The object is made when something first asks for it.
    assert_contains(&code, "width={Units().grid * 2}");
    assert_contains(&code, "units={Units()}");
    assert_contains(&code, "Units().grid = 8;");
    // Its enums are the type's: nothing is made to read one.
    assert_contains(&code, "height={Units.Small}");

    let code = lowered_in(&files, "Units").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, r#"import { $int, $object, $singleton } from "ljos-web/object";"#);
    assert_contains(&code, "function Units$component($props) {");
    assert_lacks(&code, "export default function");
    assert_contains(&code, "twice={Units().grid * 2}");
    assert_contains(&code, "const Units = $singleton(Units$component, {\n\tSmall: 0,\n\tLarge: 1\n});");
    assert_contains(&code, "export default Units;");

    // One named like the type it is one of leaves the name to the type.
    let files = [("QtObject", "pragma Singleton\nimport QtQuick\nQtObject { property int grid: 8 }")];
    let code = lowered_in(&files, "QtObject").unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, r#"import { QtObject } from "ljos-web/QtQuick";"#);
    assert_contains(&code, "const QtObject$singleton = $singleton(QtObject$component, {});");
    assert_contains(&code, "Object.setPrototypeOf(QtObject$singleton, QtObject);");
    assert_contains(&code, "export default QtObject$singleton;");
}

#[test]
fn a_module_of_the_project_is_the_files_it_is_said_to_be() {
    let files = [
        ("Main", "import QtQuick\nimport Parts\nItem {\n    Dial { value: Theme.accent }\n    Gauge { }\n}"),
        ("parts/Dial", "import QtQuick\nItem {\n    property int value\n    Needle { }\n}"),
        ("parts/gauges/Needle", "import QtQuick\nItem { }"),
        ("parts/Theme", "pragma Singleton\nimport QtQuick\nQtObject { property int accent: 3 }"),
        // Qt Design Studio's files are types by the name before `.ui`.
        ("parts/Gauge.ui", "import QtQuick\nItem { }"),
    ];
    let mut project = Project::new();
    for (file, source) in &files {
        project.add(file, source).unwrap_or_else(|errors| panic!("{file}: {errors:?}"));
    }
    for (name, file) in
        [("Dial", "parts/Dial"), ("Needle", "parts/gauges/Needle"), ("Theme", "parts/Theme"), ("Gauge", "parts/Gauge.ui")]
    {
        project.add_type("Parts", name, file);
    }
    let lowered = |name: &str| {
        let options = Options { name: name.to_string(), project: Some(project.clone()), ..Options::default() };
        let source = files.iter().find(|(file, _)| *file == name).expect("a file of the project").1;
        lowered_source(source, &options).unwrap_or_else(|errors| panic!("{name}: {errors:?}"))
    };

    let code = lowered("Main");
    assert_contains(&code, r#"import Dial from "./parts/Dial.qml";"#);
    assert_contains(&code, r#"import Theme from "./parts/Theme.qml";"#);
    assert_contains(&code, r#"import Gauge from "./parts/Gauge.ui.qml";"#);
    assert_contains(&code, "value={Theme().accent}");

    // A file of the module sees the rest of it, wherever the files are.
    let code = lowered("parts/Dial");
    assert_contains(&code, r#"import Needle from "./gauges/Needle.qml";"#);

    let code = lowered("parts/Gauge.ui");
    assert_contains(&code, "export default function Gauge($props) {");
}

#[test]
fn a_type_of_a_namespace_attaches_too() {
    let code = lowered(
        r#"import QtQuick
import QtQuick.Templates as T
T.Control {
    T.ScrollIndicator.vertical: T.ScrollIndicator { }
}"#,
    );
    assert_contains(&code, r#"import * as T from "ljos-web/QtQuick/Templates";"#);
    // The attached object goes by the type's own name.
    assert_contains(&code, "ScrollIndicator$vertical={<T.ScrollIndicator");
    assert_contains(&code, "$attach={[T.ScrollIndicator]}");
    // A type that attaches is still the type where the file is made one.
    let code = lowered("import QtQuick.Templates as T\nT.ScrollIndicator {}");
    assert_contains(&code, "Object.setPrototypeOf(Sample, T.ScrollIndicator);");
}

#[test]
fn what_a_type_attaches_is_an_object_to_hold() {
    let code = lowered(
        r#"import QtQuick
import QtQuick.Templates as T
Item {
    id: item
    property bool pressed: parent.T.SplitHandle.pressed
    property var held: item.ListView
    property var kind: T.SplitView
    property int way: Item.Left
    function ask(other) {
        const said = other.ListView
        return said.isCurrentItem
    }
}"#,
    );
    // The namespace says which type; the object is what is before it.
    assert_contains(&code, "T.SplitHandle.attached(item.parent).pressed");
    // With nothing asked of it, it is the attached object.
    assert_contains(&code, "ListView.attached(item)");
    assert_contains(&code, "const said = ListView.attached(other);");
    // A type of a namespace, and a type's enum, are what they were.
    assert_contains(&code, "T.SplitView");
    assert_lacks(&code, "T.SplitView.attached");
    assert_lacks(&code, "Item.attached");
}

#[test]
fn a_string_goes_on_over_the_end_of_a_line() {
    let code = lowered("import QtQuick\nText {\n    text: \"one \\\ntwo\nthree\" + 'a\\\\b\nc'\n}");
    // The end of a line is in the string; one after a `\` is not.
    assert_contains(&code, r#"text={"one two\nthree" + "a\\b\nc"}"#);
    let unended = Project::new().add("Sample", "import QtQuick\nText { text: \"one\ntwo }").unwrap_err();
    assert_eq!(unended[0].message, "Unterminated string");
}

#[test]
fn a_file_named_by_its_path_is_made_where_the_path_is_written() {
    // `Row.qml` looks `list` up as it runs, so what `Home.qml` makes from a
    // path is given the context it is written in.
    let files = [
        (
            "Home",
            r#"import QtQuick
Item {
    id: list
    property var row: Qt.createComponent("Row.qml")
    Loader { source: "Row.qml" }
}"#,
        ),
        ("Row", "import QtQuick\nItem { width: list.width }"),
    ];
    let mut project = Project::new();
    for (file, source) in files {
        project.add(file, source).unwrap_or_else(|errors| panic!("{file}: {errors:?}"));
    }
    let options = Options {
        name: "Home".to_string(),
        project: Some(project),
        files: Some(vec!["Home.qml".to_string(), "Row.qml".to_string()]),
        ..Options::default()
    };
    let code = lowered_source(files[0].1, &options).unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, "const $scope = $context($props.$context, list, () => ({ list }));");
    assert_contains(&code, "row={$file($file1, $scope)}");
    assert_contains(&code, "<Loader source={$file($file1, $scope)}");
}

#[test]
fn a_file_the_program_keeps_is_where_the_module_naming_it_says() {
    // `qrc:/…`: a file the build puts into the program. What names one says
    // where a browser finds it, and goes on naming it as it did.
    let source = r#"import QtQuick
Item {
    property string kind: "close"
    Image { source: "qrc:/qt/qml/Palette/icons/qt.png" }
    Image { source: `qrc:/qt/qml/Palette/icons/dark/${kind}.svg` }
    // What C++ opens as a file is named so.
    property string table: ":/data/medals.csv"
    Image { source: "qrc:/qt/qml/Palette/icons/nothing.png" }
}"#;
    let mut project = Project::new();
    project.add("views/Main", source).unwrap_or_else(|errors| panic!("{errors:?}"));
    for (address, path) in [
        ("qrc:/qt/qml/Palette/icons/qt.png", "icons/qt.png"),
        ("qrc:/qt/qml/Palette/icons/qt.png.license", "icons/qt.png.license"),
        ("qrc:/qt/qml/Palette/icons/dark/close.svg", "icons/dark/close.svg"),
        ("qrc:/qt/qml/Palette/icons/dark/user.svg", "icons/dark/user.svg"),
        ("qrc:/qt/qml/Palette/icons/dark/shade.png", "icons/dark/shade.png"),
        ("qrc:/qt/qml/Palette/icons/light/close.svg", "icons/light/close.svg"),
        ("qrc:/data/medals.csv", "../data/medals.csv"),
    ] {
        project.add_resource(address, path);
    }
    let options = Options { name: "views/Main".to_string(), project: Some(project), ..Options::default() };
    let code = lowered_source(source, &options).unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, r#"import { $object, $resource, $string, $url } from "ljos-web/object";"#);
    // By where it is from the file.
    assert_contains(&code, r#"$resource("qrc:/qt/qml/Palette/icons/qt.png", new URL("../icons/qt.png", import.meta.url).href);"#);
    assert_contains(&code, r#"$resource("qrc:/data/medals.csv", new URL("../../data/medals.csv", import.meta.url).href);"#);
    // A name put together as the program runs may be any that starts and
    // ends so.
    assert_contains(&code, r#"$resource("qrc:/qt/qml/Palette/icons/dark/close.svg", new URL("../icons/dark/close.svg", import.meta.url).href);"#);
    assert_contains(&code, r#"$resource("qrc:/qt/qml/Palette/icons/dark/user.svg", "#);
    // Only what is named: not what is next to it, nor what starts as a
    // whole name does.
    assert_lacks(&code, "light/close.svg");
    assert_lacks(&code, "shade.png");
    assert_lacks(&code, "qt.png.license");
    // The program still names them as it did, and one the build does not
    // keep is nowhere.
    assert_contains(&code, r#"source={"qrc:/qt/qml/Palette/icons/qt.png"}"#);
    assert_lacks(&code, r#"$resource("qrc:/qt/qml/Palette/icons/nothing.png""#);
}

#[test]
fn a_file_of_a_module_of_qt_has_the_types_of_that_module() {
    // A style of Qt Quick Controls is QML in a module of Qt's: what the
    // module has that is not a file, the file has without an import.
    let source = "import QtQuick\nItem { visible: parent === Overlay.overlay }";
    let mut project = Project::new();
    project.add("Dialog", source).unwrap_or_else(|errors| panic!("{errors:?}"));
    project.add_type("QtQuick.Controls.Basic", "Dialog", "Dialog");
    let options = Options { name: "Dialog".to_string(), project: Some(project), ..Options::default() };
    let code = lowered_source(source, &options).unwrap_or_else(|errors| panic!("{errors:?}"));
    assert_contains(&code, r#"import { Overlay } from "ljos-web/QtQuick/Controls/Basic";"#);

    // A file of no module has to import it.
    let errors = errors(source);
    assert!(errors.iter().any(|error| error.contains("`Overlay` is not defined")), "{errors:?}");
}

#[test]
fn an_object_a_property_holds_is_made_with_its_owner() {
    let code = lowered(
        r#"import QtQuick
QtObject {
    default property list<QtObject> things
    property QtObject held: QtObject { objectName: "held" }
    property Component part: Item {}
}"#,
    );
    // Read or not, it is there once its owner is: a template is not.
    assert_contains(&code, r#"$made={["held"]}"#);
    // What an instance is given between its braces goes to the property the
    // type says, a list here.
    assert_contains(&code, r#"$default={["things", true]}"#);
    assert_lacks(&code, "$props.children");

    let code = lowered(
        r#"import QtQuick
Item {
    default property Item slot
    Item {}
}"#,
    );
    assert_contains(&code, r#"$default={["slot", false]}"#);
    // An alias says where they go by what it names.
    let code = lowered(
        r#"import QtQuick
Item {
    default property alias content: inner.children
    Item { id: inner }
}"#,
    );
    assert_lacks(&code, "$default");
}

#[test]
fn a_handler_in_a_group_is_a_handler() {
    let code = lowered(
        r#"import QtQuick
MouseArea {
    id: area
    property Item bar
    drag.onActiveChanged: console.log(drag.active)
    bar.onWidthChanged: { console.log("wide") }
    bar.onClicked: (mouse) => console.log(mouse.x)
    bar.opacity: 0.5
}"#,
    );
    assert_contains(&code, "drag$onActiveChanged={() => console.log(area.drag.active)}");
    assert_contains(&code, "bar$onWidthChanged={() => {");
    assert_contains(&code, "bar$onClicked={(mouse) => console.log(mouse.x)}");
    assert_contains(&code, "bar$opacity={.5}");
}

#[test]
fn a_script_is_worth_its_last_statement() {
    let code = lowered(
        r#"import QtQuick
Item {
    id: item
    property bool wide
    width: { var twice = height * 2; twice }
    height: if (wide) { 10 } else if (parent) { 20 } else 30
    x: switch (width) { case 1: 5; break; default: 7 }
    onWidthChanged: { height }
    states: State { PropertyChanges { target: item; y: { if (wide) 1; else 2 } } }
}"#,
    );
    assert_contains(&code, "return twice;");
    assert_contains(&code, "return 10;");
    assert_contains(&code, "return 20;");
    assert_contains(&code, "else return 30;");
    assert_contains(&code, "return 5;");
    assert_contains(&code, "return 7;");
    assert_contains(&code, "if (item.wide) return 1;");
    assert_contains(&code, "else return 2;");
    assert_lacks(&code, "return item.height;");
    assert_lacks(&code, "break;");
}

#[test]
fn a_script_to_run_is_a_function() {
    let code = lowered(
        r#"import QtQuick
Item {
    id: item
    property int count
    states: State {
        StateChangeScript { script: item.count = 1 }
        AnchorChanges { target: item; anchors.left: item.parent.left }
    }
    SequentialAnimation {
        ScriptAction { script: { item.count++ } }
        ScriptAction { script: item.count }
    }
}"#,
    );
    // Run when its time comes, and worth nothing: not even what it ends on.
    assert_contains(&code, "script={() => item.count = 1}");
    assert_contains(&code, "script={() => {");
    assert_contains(&code, "script={() => item.count}");
    assert_lacks(&code, "return item.count++");
    // A line to be anchored to is a script to Qt too, and a value here.
    assert_contains(&code, "anchors$left={item.parent.left}");
}

#[test]
fn an_enum_key_is_a_constant() {
    let code = lowered(
        r#"import QtQuick
import QtQuick.Layouts
Text {
    id: text
    property int named: Text.AlignRight
    property var held: Text.AlignRight
    property real number: Text.AlignRight
    horizontalAlignment: Text.AlignHCenter
    verticalAlignment: text.named ? Text.AlignTop : Text.AlignBottom
    wrapMode: Text.Wrap
    elide: text.elide
    font.capitalization: Font.AllUppercase
    Layout.alignment: Qt.AlignRight
    Behavior on x { NumberAnimation { easing.type: Easing.InOutQuad } }
    Text { wrapMode: Text.Wrap }
}"#,
    );
    // The number it stands for, read once by the module: nothing to evaluate
    // for each object, and no change to tell of when one is made.
    assert_contains(&code, "const Text$AlignHCenter = Text.AlignHCenter;");
    assert_contains(&code, "horizontalAlignment={Text$AlignHCenter}");
    assert_contains(&code, "named={Text$AlignRight}");
    assert_contains(&code, "font$capitalization={Font$AllUppercase}");
    assert_contains(&code, "easing$type={Easing$InOutQuad}");
    assert_contains(&code, "Layout$alignment={Qt$AlignRight}");
    assert_eq!(code.matches("const Text$Wrap = ").count(), 1);
    assert_eq!(code.matches("wrapMode={Text$Wrap}").count(), 2);
    // Only for an enum or an `int`, and only a key by itself, as in Qt.
    assert_contains(&code, "held={Text.AlignRight}");
    assert_contains(&code, "number={Text.AlignRight}");
    assert_contains(&code, "verticalAlignment={text.named ? Text.AlignTop : Text.AlignBottom}");
    assert_contains(&code, "elide={text.elide}");
}

#[test]
fn an_enum_key_of_a_type_of_a_namespace_is_a_binding() {
    let code = lowered(
        r#"import QtQuick
import QtQuick.Templates as T
Item {
    property int month: T.Calendar.Month.March
    property var held: T.Calendar.Month.March
    T.Label { elide: T.Label.ElideRight; wrapMode: T.Label.WrapMode.WordWrap }
    function third() { return T.Calendar.Month.March + T.Label.TextElideMode.ElideRight }
    function none() { return T.Calendar.Nope.March }
}"#,
    );
    // Qt looks a key up by the name of a type and through no namespace: this
    // is a binding, and `onElideChanged` beside it is told of what it gives.
    // The keys are on the type, by whatever name it is found: with the name
    // of the enum between, Qt gives the same number and JavaScript nothing.
    assert_contains(&code, "month={T.Calendar.March}");
    assert_contains(&code, "held={T.Calendar.March}");
    assert_contains(&code, "elide={T.Label.ElideRight}");
    assert_contains(&code, "wrapMode={T.Label.WordWrap}");
    assert!(!code.contains("const T$"), "{code}");
    assert_contains(&code, "return T.Calendar.March + T.Label.ElideRight;");
    // What is no enum of the type is left to be what it is.
    assert_contains(&code, "return T.Calendar.Nope.March;");
}

#[test]
fn what_a_type_attaches_is_written_where_it_is_read() {
    let code = lowered(
        r#"import QtQuick
import QtQuick.Controls
import QtQuick.Templates as T
Item {
    id: item
    function show(on) {
        ToolTip.visible = on
        ToolTip.timeout += 1
        item.ToolTip.delay = 2
        T.ToolTip.delay++
        return ToolTip.visible
    }
}"#,
    );
    assert_contains(&code, "ToolTip.attached(item).visible = on;");
    assert_contains(&code, "ToolTip.attached(item).timeout += 1;");
    assert_contains(&code, "ToolTip.attached(item).delay = 2;");
    assert_contains(&code, "T.ToolTip.attached(item).delay++;");
    assert_contains(&code, "return ToolTip.attached(item).visible;");
}

#[test]
fn a_state_changes_what_a_type_attaches() {
    let code = lowered(
        r#"import QtQuick
import QtQuick.Layouts
import QtQuick.Templates as T
Item {
    id: item
    states: State {
        PropertyChanges { target: item; Layout.preferredWidth: width / 2; T.ToolTip.delay: 5 }
        PropertyChanges { item.Layout.topMargin: 3 }
    }
}"#,
    );
    assert_contains(&code, "\"preferredWidth\",\n\t\t() => item.width / 2,\n\t\tnull,\n\t\tLayout\n");
    assert_contains(&code, "\"delay\",\n\t\t() => 5,\n\t\tnull,\n\t\tT.ToolTip\n");
    assert_contains(&code, "\"topMargin\",\n\t\t() => 3,\n\t\t() => item,\n\t\tLayout\n");
    assert_lacks(&code, "$attach");
}

#[test]
fn a_name_in_what_a_state_changes_is_the_targets() {
    let code = lowered(
        r#"import QtQuick
Item {
    id: root
    property int size: 7
    Item { id: box; Item { id: a } }
    states: State {
        PropertyChanges { target: a; width: parent.width / 2; height: width + 1; x: size }
        PropertyChanges { a.y: parent.height }
        PropertyChanges { target: box.children[0]; z: parent.z; x: size; y: Math.round(text.length) }
        AnchorChanges { target: a; anchors.right: parent.right }
        ParentChange { target: a; parent: box; width: parent.width }
    }
}"#,
    );
    // As Qt evaluates them: with the target as the object the names are of,
    // and the root after it.
    assert_contains(&code, "() => a.parent.width / 2");
    assert_contains(&code, "() => a.width + 1");
    assert_contains(&code, "() => root.size");
    assert_contains(&code, "anchors$right={a.parent.right}");
    // A property named through an id is a binding where it is written.
    assert_contains(&code, "() => root.parent.height");
    // A target only the running program knows is given to the binding: a
    // name is the target's if it has it, and the root's if not.
    assert_contains(&code, "($target) => (\"parent\" in $target ? $target.parent : root.parent).z");
    assert_contains(&code, "($target) => \"size\" in $target ? $target.size : root.size");
    // A name nothing else has is the target's, and a global is itself.
    assert_contains(&code, "($target) => Math.round($target.text.length)");
    // A ParentChange has a `parent` of its own.
    assert_contains(&code, ".parent.width}");
    assert_lacks(&code, "width={a.parent.width}");
}

#[test]
fn a_source_with_no_suffix_is_the_picture_qt_finds() {
    let source = r#"import QtQuick
Item {
    Image { source: "images/logo" }
    Image { source: "./images/mark" }
    Image { source: "images/whole" }
    Image { source: "images/none" }
    Image { source: "images/logo.v2" }
    Image { source: "../logo" }
}"#;
    let options = Options {
        name: "Sample".to_string(),
        pictures: Some(
            ["images/logo.svg", "images/logo.png", "images/mark.webp", "images/whole", "images/whole.png", "logo.png"]
                .map(String::from)
                .to_vec(),
        ),
        ..Options::default()
    };
    let code = lowered_source(source, &options).unwrap_or_else(|errors| panic!("{errors:?}"));
    // The first of the formats Qt reads, in its order: `png` before `svg`.
    assert_contains(&code, r#"new URL("images/logo.png", import.meta.url)"#);
    assert_contains(&code, r#"new URL("./images/mark.webp", import.meta.url)"#);
    // A file of that very name is the one, and so is a name with a suffix.
    assert_contains(&code, r#"new URL("images/whole", import.meta.url)"#);
    assert_contains(&code, r#"new URL("images/none", import.meta.url)"#);
    assert_contains(&code, r#"new URL("images/logo.v2", import.meta.url)"#);
    assert_contains(&code, r#"new URL("../logo", import.meta.url)"#);
}

#[test]
fn this_is_the_object_a_binding_or_a_handler_is_written_on() {
    let code = lowered(
        r#"import QtQuick
Item {
    id: root
    function grown() { return this.width + 1 }
    Rectangle {
        id: box
        width: this.height * 2
        border.width: this.height
        property var each: [1, 2].map(n => this.height + n)
        property var own: [1, 2].map(function () { return this })
        MouseArea { onClicked: console.log(this.width); Component.onCompleted: this.width = 3 }
        states: State { PropertyChanges { target: box; color: this.height > 3 ? "red" : "blue" } }
    }
}"#,
    );
    assert_contains(&code, "width={box.height * 2}");
    assert_contains(&code, "border$width={box.height}");
    assert_contains(&code, "[1, 2].map((n) => box.height + n)");
    assert_contains(&code, "onClicked={(mouse) => console.log($1.width)}");
    assert_contains(&code, "Component$onCompleted={() => $1.width = 3}");
    // What a state changes is a binding of its target's.
    assert_contains(&code, r#"() => box.height > 3 ? "red" : "blue""#);
    // A function has its own: the object it is called on, or none.
    assert_contains(&code, "return this.width + 1;");
    assert_contains(&code, "return this;");
}
