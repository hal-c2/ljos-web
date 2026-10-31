//! QtQuick objects as the runtime's components.
//!
//! Every object becomes a JSX element whose tag is its type, which Solid
//! turns into `createComponent(Type, props)`: a plain value for what is
//! written as one, a getter for a binding. Nothing is left of QML's structure
//! at run time but those calls:
//!
//! ```text
//! Item { id: root; width: 200; Text { text: root.width } }
//!
//! export default function Sample($props) {
//!   const root = $props.$self ?? $object();
//!   return <Item $self={root} $given={$props} $is={Sample} width={200}><Text text={root.width}/>{$props.children}</Item>;
//! }
//! ```
//!
//! An object is held by a binding made before anything is created (its `id`,
//! or a name of ours), so an expression may name any object of its component
//! whatever the order they are created in.

use std::collections::{BTreeMap, BTreeSet, HashSet};

use oxc_allocator::{ArenaBox, ArenaVec};
use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use qml_syntax::ast::*;
use oxc_span::Span;

use super::{
    names,
    paths::{Paths, is_absolute, is_resolved},
    scope::{self, Tree},
    texts::Text,
    types::{self, Member, Origin, Property, Types},
};
use crate::{Error, build::B};

/// What the module has to import.
#[derive(Default)]
pub(crate) struct Uses {
    /// The kernel's own: `$object`, `$component`, `$url`.
    pub kernel: BTreeSet<&'static str>,
    /// QML's globals: `Qt`, `qsTr`.
    pub globals: BTreeSet<&'static str>,
    /// Qt's types, by the URI of the module the file imports them from.
    pub modules: BTreeMap<String, BTreeSet<String>>,
    /// Components, by name, and the file each is.
    pub files: BTreeMap<String, String>,
    /// What the file imports `as` something.
    pub namespaces: BTreeSet<String>,
    /// The objects something names: the others need no binding.
    pub handles: HashSet<String>,
    /// The QML files something names by their path.
    pub paths: Paths,
    /// The QML something gives `Qt.createQmlObject` as a text.
    pub texts: Vec<Text>,
}

impl Uses {
    pub(crate) fn origin(&mut self, name: &str, origin: &Origin) {
        // `C.Button` is reached through `C`.
        let first = name.split('.').next().unwrap_or(name);
        match origin {
            Origin::Module(uri) => {
                self.modules.entry(uri.clone()).or_default().insert(first.to_string());
            }
            Origin::File(file) => {
                self.files.insert(first.to_string(), file.clone());
            }
            Origin::Namespace => {
                self.namespaces.insert(first.to_string());
            }
            // The web runtime has these modules: nothing stands in.
            Origin::Inline | Origin::StandIn(_) => {}
        }
    }
}

/// What an object is to the code around it.
enum Role<'r> {
    /// The root of the file's component or of an inline one: what an
    /// instance sets is set on it. With the component's name: the object
    /// is one of its.
    Root(&'r str),
    /// The root of a template: the object a delegate makes, given `data`.
    Template(&'r str),
    Plain,
    /// `Animation on x { }`: a value source or interceptor of a property.
    Source { target: &'r str, property: String },
}

/// What an object's members come to.
struct Built<'a> {
    attributes: ArenaVec<'a, JSXAttributeItem<'a>>,
    children: ArenaVec<'a, JSXChild<'a>>,
    /// Declared properties and their type's default.
    properties: Vec<(String, Expression<'a>)>,
    signals: Vec<String>,
    functions: Vec<(String, Expression<'a>)>,
    aliases: Vec<(String, Expression<'a>)>,
    /// The types whose attached properties the object sets.
    attach: Vec<String>,
    /// What a `PropertyChanges` changes.
    changes: Vec<Expression<'a>>,
    /// The properties it asks whoever makes it for.
    required: Vec<String>,
    /// The properties whose value is an object written there: made with the
    /// object, whether or not anything reads them.
    made: Vec<String>,
}

pub(crate) struct Lower<'a, 's> {
    b: B<'a>,
    tree: &'s Tree<'a>,
    types: Types<'s>,
    name: &'s str,
    pub errors: Vec<Error>,
    /// What goes before the component in the module: what its objects
    /// declare, the URLs it names, its inline components.
    pub module: Vec<Statement<'a>>,
    pub uses: Uses,
    /// The bindings of the component being built and of each template in it
    /// that is open.
    frames: Vec<Vec<Statement<'a>>>,
    /// The object an instance's children go into.
    children: Option<String>,
    /// The property they are the value of instead, and whether it is a list:
    /// `default property list<QtObject> things`.
    default: Option<(String, bool)>,
    specs: usize,
    /// The files the module names, each once: `$url1` is the first.
    urls: Vec<String>,
    /// Where the path being lowered is taken from, when that is not this
    /// file's directory: the way there, ending in a slash.
    home: Option<String>,
    /// A path is taken from this file wherever it is given: the program's
    /// `QML_COMPAT_RESOLVE_URLS_ON_ASSIGNMENT`.
    pub(crate) assigned: bool,
    /// The enum keys each open frame has a constant for.
    keys: Vec<HashSet<String>>,
    /// The keys of the enums the component being built declares.
    enums: Vec<(String, Expression<'a>)>,
    /// The names some component of the project takes from whatever made it.
    pub dynamic: HashSet<String>,
}

impl<'a, 's> Lower<'a, 's> {
    pub(crate) fn new(b: B<'a>, tree: &'s Tree<'a>, types: Types<'s>, name: &'s str) -> Self {
        Self {
            b,
            tree,
            types,
            name,
            errors: Vec::new(),
            module: Vec::new(),
            uses: Uses::default(),
            frames: Vec::new(),
            children: None,
            default: None,
            specs: 0,
            urls: Vec::new(),
            home: None,
            assigned: false,
            keys: Vec::new(),
            enums: Vec::new(),
            dynamic: types.project.dynamic_names(),
        }
    }

    /// `function Name($props) { const root = ...; return <Root .../>; }`, and
    /// the keys of the enums it declares: those are the type's, not an
    /// object's.
    pub(crate) fn component(
        &mut self,
        name: &str,
        root: QmlObject<'a>,
        export: bool,
    ) -> (Statement<'a>, Vec<(String, Expression<'a>)>) {
        let b = self.b;
        let index = self.tree.index_of(&root);
        let handle = self.tree.handle(index).to_string();
        let children = children_target(&root).unwrap_or_else(|| handle.clone());
        // What an instance gives the root goes through its binding.
        self.uses.handles.insert(handle.clone());
        self.uses.handles.insert(children.clone());
        let outer_children = self.children.replace(children);
        let outer_default = std::mem::replace(&mut self.default, default_property(&root));
        let outer_frames = std::mem::take(&mut self.frames);
        let outer_keys = std::mem::take(&mut self.keys);
        let outer_enums = std::mem::take(&mut self.enums);
        self.open();
        let element = self.element(root, Role::Root(name));
        let frame = self.close();
        self.frames = outer_frames;
        self.keys = outer_keys;
        let enums = std::mem::replace(&mut self.enums, outer_enums);
        self.children = outer_children;
        self.default = outer_default;

        self.uses.kernel.insert("$object");
        let mut statements = b.vec();
        // An instance that has an id made the object already.
        let given = b.member(b.id("$props"), "$self");
        statements.push(b.const_(&handle, b.coalesce(given, b.call(b.id("$object"), []))));
        statements.extend(frame);
        // Where the project looks a name up as it runs, the component says
        // what it has to be found: its ids, and its root for its properties.
        // What made it is where the search goes on.
        if !self.dynamic.is_empty() {
            let mut arguments = vec![b.member(b.id("$props"), "$context"), b.id(&handle)];
            let ids: Vec<_> =
                self.tree.ids_of(index).into_iter().filter(|id| self.dynamic.contains(*id)).collect();
            if !ids.is_empty() {
                arguments.push(b.arrow(&[], b.record(ids.iter().map(|id| ((*id).to_string(), b.id(id))))));
            }
            statements.push(b.const_(&self.tree.scope_of(index), b.call(b.id("$context"), arguments)));
        }
        statements.push(b.return_(element));
        let function = if export {
            b.export_default_function(name, &["$props"], statements)
        } else {
            b.function_declaration(name, &["$props"], statements)
        };
        (function, enums)
    }

    /// `Object.assign(Name, { Light: 0, Dark: 1 })`: `Name.Dark` is read off
    /// the component, as it is off a type of Qt's.
    pub(crate) fn keys(&self, name: &str, enums: Vec<(String, Expression<'a>)>) -> Statement<'a> {
        let b = self.b;
        b.statement(b.call(b.member(b.id("Object"), "assign"), [b.id(name), b.record(enums)]))
    }

    /// `Object.setPrototypeOf(Name, Root)`: what is read off the type its
    /// root is (`Label.ElideRight`, `StackView.view`) is read off the
    /// component too, as a class has what the one it extends has.
    pub(crate) fn extends(&self, name: &str, root: &str) -> Statement<'a> {
        let b = self.b;
        let mut parts = root.split('.');
        let mut base = b.id(parts.next().unwrap_or(root));
        for part in parts {
            base = b.member(base, part);
        }
        b.statement(b.call(b.member(b.id("Object"), "setPrototypeOf"), [b.id(name), base]))
    }

    fn frame(&mut self) -> &mut Vec<Statement<'a>> {
        self.frames.last_mut().expect("an object is lowered inside a component")
    }

    fn open(&mut self) {
        self.frames.push(Vec::new());
        self.keys.push(HashSet::new());
    }

    fn close(&mut self) -> Vec<Statement<'a>> {
        self.keys.pop();
        self.frames.pop().unwrap_or_default()
    }

    fn element(&mut self, object: QmlObject<'a>, role: Role<'_>) -> Expression<'a> {
        let b = self.b;
        let tree = self.tree;
        let index = tree.index_of(&object);
        let info = &tree.objects[index];
        let handle = tree.handle(index);
        let tag = object.type_name.to_string();
        if let Some(origin) = &info.origin {
            self.uses.origin(&tag, origin);
        }

        let mut built = Built {
            attributes: b.vec(),
            children: b.vec(),
            properties: Vec::new(),
            signals: Vec::new(),
            functions: Vec::new(),
            aliases: Vec::new(),
            attach: Vec::new(),
            changes: Vec::new(),
            required: Vec::new(),
            made: Vec::new(),
        };
        built.attributes.push(b.attr("$self", b.id(handle)));
        match &role {
            Role::Root(name) => {
                built.attributes.push(b.attr("$given", b.id("$props")));
                built.attributes.push(b.attr("$is", b.id(name)));
            }
            Role::Source { target, property } => {
                self.uses.handles.insert((*target).to_string());
                built.attributes.push(b.attr("$target", b.id(target)));
                built.attributes.push(b.attr_string("$property", property));
            }
            Role::Template(_) | Role::Plain => {}
        }
        // A component of the project may look for a name in what made it.
        if !self.dynamic.is_empty() && matches!(info.origin, Some(Origin::File(_) | Origin::Inline)) {
            let scope = tree.scope_of(index);
            built.attributes.push(b.attr("$context", b.id(&scope)));
            self.uses.handles.insert(scope);
        }
        if !matches!(role, Role::Root(_)) {
            self.uses.kernel.insert("$object");
            // An object with an id is known by it across a reload.
            let named = info.id.map(|id| b.string(id));
            let made = b.const_(handle, b.call(b.id("$object"), named));
            self.frame().push(made);
        }

        let bound: HashSet<&str> = object
            .members
            .iter()
            .filter_map(|member| match member {
                QmlMember::Binding(binding) => binding.name.as_simple(),
                QmlMember::Property(property) if property.value.is_some() => Some(property.name.name.as_str()),
                _ => None,
            })
            .collect();
        self.members(object.members, index, &[], &mut built);

        // A delegate's required properties are what it is given.
        if let Role::Template(data) = role {
            let mut required = std::mem::take(&mut built.required);
            if let Some(kind) = &info.kind {
                for name in self.types.required(kind) {
                    if !required.contains(&name) {
                        required.push(name);
                    }
                }
            }
            for name in required {
                if !bound.contains(name.as_str()) {
                    built.attributes.push(b.attr(&name, b.member(b.id(data), &name)));
                }
            }
        }

        if !built.properties.is_empty() || !built.signals.is_empty() {
            let spec = match self.specs {
                0 => format!("{}$", self.name),
                count => format!("{}${count}", self.name),
            };
            self.specs += 1;
            let mut entries = vec![("properties".to_string(), b.record(built.properties))];
            if !built.signals.is_empty() {
                let signals = built.signals.iter().map(|signal| b.string(signal));
                entries.push(("signals".to_string(), b.array(signals)));
            }
            self.module.push(b.const_(&spec, b.record(entries)));
            built.attributes.push(b.attr("$declare", b.id(&spec)));
        }
        if !built.functions.is_empty() {
            built.attributes.push(b.attr("$functions", b.record(built.functions)));
        }
        if !built.aliases.is_empty() {
            built.attributes.push(b.attr("$aliases", b.record(built.aliases)));
        }
        if !built.attach.is_empty() {
            let types = built.attach.iter().map(|name| match name.split_once('.') {
                Some((namespace, name)) => b.member(b.id(namespace), name),
                None => b.id(name),
            });
            built.attributes.push(b.attr("$attach", b.array(types)));
        }
        if !built.changes.is_empty() {
            built.attributes.push(b.attr("$changes", b.array(built.changes)));
        }
        if !built.made.is_empty() {
            let names = built.made.iter().map(|name| b.string(name));
            built.attributes.push(b.attr("$made", b.array(names)));
        }
        if self.frames.len() == 1 && self.children.as_deref() == Some(handle) {
            match self.default.take() {
                Some((name, is_list)) => {
                    built.attributes.push(b.attr("$default", b.array([b.string(&name), b.boolean(is_list)])));
                }
                None => built.children.push(b.child(b.member(b.id("$props"), "children"))),
            }
        }
        b.element(&tag, built.attributes, built.children)
    }

    /// The members of an object, or of a group of it (`font { }`), `group`
    /// being the names that lead there.
    fn members(
        &mut self,
        members: ArenaVec<'a, QmlMember<'a>>,
        index: usize,
        group: &[&'a str],
        built: &mut Built<'a>,
    ) {
        for member in members {
            match member {
                QmlMember::Object(child) if scope::is_group(&child) => {
                    let mut path = group.to_vec();
                    path.extend(child.type_name.parts.iter().copied());
                    self.members(child.members, index, &path, built);
                }
                QmlMember::Object(child) => self.child(child, index, built),
                QmlMember::Binding(binding) => self.binding(binding, index, group, built),
                QmlMember::Property(property) => self.property(property, built),
                QmlMember::Signal(signal) => built.signals.push(signal.name.name.to_string()),
                QmlMember::Function(function) => self.function(function, index, built),
                QmlMember::InlineComponent(inline) => {
                    let name = inline.name.name.as_str();
                    let root = inline.object.type_name.to_string();
                    let (component, enums) = self.component(name, inline.object, false);
                    self.module.push(component);
                    let extends = self.extends(name, &root);
                    self.module.push(extends);
                    if !enums.is_empty() {
                        let keys = self.keys(name, enums);
                        self.module.push(keys);
                    }
                }
                QmlMember::Enum(declaration) => {
                    for member in &declaration.members {
                        #[expect(clippy::cast_precision_loss)]
                        let value = self.b.number(member.value as f64);
                        self.enums.push((member.name.name.to_string(), value));
                    }
                }
            }
        }
    }

    /// An object written inside another.
    fn child(&mut self, child: QmlObject<'a>, index: usize, built: &mut Built<'a>) {
        let b = self.b;
        let tree = self.tree;
        if let Some(on) = &child.on {
            let property = on.parts.join("$");
            let target = tree.handle(index);
            let element = self.element(child, Role::Source { target, property });
            built.children.push(b.child(element));
            return;
        }
        let is_template = tree.objects[tree.index_of(&child)].is_template;
        let default = tree.objects[index].kind.as_ref().and_then(|kind| self.types.default_component(kind));
        let value = self.object_value(child);
        match default {
            Some(name) => built.attributes.push(b.attr(&name, value)),
            // Nothing takes a `Component` as a child: its id is how it is used.
            None if is_template => {}
            None => built.children.push(b.child(value)),
        }
    }

    /// Whether a value is an object, or a list of them, that is made where it
    /// is written: not a `Component`, which is made when something asks.
    fn makes(&self, value: &QmlBindingValue<'a>) -> bool {
        let made = |object: &QmlObject<'a>| {
            let index = self.tree.index_of(object);
            !self.tree.objects[index].is_template && !self.tree.is_root(index)
        };
        match value {
            QmlBindingValue::Object(object) => made(object),
            QmlBindingValue::Objects(objects) => objects.iter().any(made),
            _ => false,
        }
    }

    /// An object where a value goes: the object, or the template it is.
    fn object_value(&mut self, object: QmlObject<'a>) -> Expression<'a> {
        let index = self.tree.index_of(&object);
        if self.tree.objects[index].is_template {
            self.template(object, index)
        } else if self.tree.is_root(index) {
            self.delegate(object, index)
        } else {
            self.element(object, Role::Plain)
        }
    }

    /// `Component { id: name; Object { } }`: the template of the object in it.
    fn template(&mut self, object: QmlObject<'a>, index: usize) -> Expression<'a> {
        let b = self.b;
        let handle = self.tree.handle(index);
        let has_id = scope::id(&object).is_some();
        let span = object.type_name.span;
        let mut content = None;
        for member in object.members {
            match member {
                QmlMember::Object(child) if content.is_none() => content = Some(child),
                QmlMember::Binding(binding) if binding.name.as_simple() == Some("id") => {}
                _ => self.errors.push(Error::new("a Component holds one object and nothing else", span)),
            }
        }
        let component = match content {
            Some(child) => self.object_value(child),
            None => {
                self.errors.push(Error::new("a Component with no object in it", span));
                b.void_0()
            }
        };
        if !has_id {
            return component;
        }
        let named = b.const_(handle, component);
        self.frame().push(named);
        b.id(handle)
    }

    /// `$component((data) => { const ...; return <Root .../>; })`
    fn delegate(&mut self, object: QmlObject<'a>, index: usize) -> Expression<'a> {
        let b = self.b;
        let tree = self.tree;
        let data = tree.data(tree.objects[index].context).unwrap_or("$data");
        self.open();
        let element = self.element(object, Role::Template(data));
        let frame = self.close();
        let mut statements = b.vec();
        statements.extend(frame);
        statements.push(b.return_(element));
        self.uses.kernel.insert("$component");
        b.call(b.id("$component"), [b.arrow_block(&[data], statements)])
    }

    fn binding(&mut self, binding: QmlBinding<'a>, index: usize, group: &[&'a str], built: &mut Built<'a>) {
        let b = self.b;
        let mut path = group.to_vec();
        path.extend(binding.name.parts.iter().copied());
        if path == ["id"] {
            return;
        }
        let span = binding.name.span;
        let changes = self.is_class(index, "QQuickPropertyChanges") && !scope::CHANGES.contains(&path[0]);
        if path[0].starts_with(|c: char| c.is_ascii_uppercase()) && !(changes && path[0] != "Component") {
            return self.attached(&path, binding.value, built, span);
        }
        if changes {
            return self.change(&path, binding.value, built, span);
        }

        // `drag.onActiveChanged`, `toolbar.onBackClicked`: a handler of what
        // the property holds, whose signals are known when its type is Qt's.
        let held = match path.as_slice() {
            [group @ .., _] if !group.is_empty() => {
                self.tree.property(self.types, index, group).and_then(|property| property.value)
            }
            _ => None,
        };
        let handler = match path.as_slice() {
            [name] => types::handled(name)
                .filter(|_| !matches!(self.tree.member(self.types, index, name), Some(Member::Property(_)))),
            [.., name] => types::handled(name).filter(|_| held.is_none_or(|held| held.0.property(name).is_none())),
            [] => None,
        };
        let value = match handler {
            Some(signal) => {
                let parameters = match (path.len(), held) {
                    (1, _) => self.tree.signal(self.types, index, &signal).unwrap_or_default(),
                    (_, Some(held)) => held.0
                        .signal(&signal)
                        .map(|signal| signal.parameters.iter().map(|name| (*name).to_string()).collect())
                        .unwrap_or_default(),
                    (_, None) => Vec::new(),
                };
                let carried = match (path.len(), held) {
                    (1, _) => self.tree.carried(self.types, index, &signal),
                    (_, Some(held)) => types::carried(held, &signal),
                    (_, None) => None,
                };
                // `onTextChanged: note(text)` names the argument or the
                // property, which are the same: only a script that names
                // the argument is given it.
                let takes = match &binding.value {
                    QmlBindingValue::Expression(
                        Expression::FunctionExpression(_) | Expression::ArrowFunctionExpression(_),
                    ) => true,
                    value => parameters.first().is_some_and(|name| mentions(value, name)),
                };
                let mut handler = self.handler(binding.value, &parameters, span);
                if let Some(property) = carried.filter(|_| takes) {
                    let mut told = vec![self.tree.handle(index)];
                    told.extend(&path[..path.len() - 1]);
                    told.push(property);
                    self.told(&mut handler, &told);
                }
                handler
            }
            None => {
                let property = self.tree.property(self.types, index, &path).unwrap_or_else(types::no_property);
                if self.makes(&binding.value) {
                    built.made.push(path.join("$"));
                }
                if property.is_url && !self.assigned {
                    self.home = self.tree.home(self.types, index, path[0]).and_then(|file| self.towards(&file));
                }
                let value = self.value(binding.value, property);
                self.home = None;
                value
            }
        };
        built.attributes.push(b.attr(&path.join("$"), value));
    }

    /// `Layout.fillWidth: true`, `Keys.onPressed: ...`: a property or a
    /// handler of the object a type attaches to this one.
    fn attached(&mut self, path: &[&'a str], value: QmlBindingValue<'a>, built: &mut Built<'a>, span: Span) {
        let b = self.b;
        // `T.Overlay.modal`: the type is the namespace's.
        let qualified = path.len() > 2 && self.types.namespace(path[0]).is_some();
        let (parts, rest) = path.split_at(if qualified { 2 } else { 1 });
        let type_name = parts.join(".");
        // The attached object is known by the type's own name.
        let name = path[parts.len() - 1..].join("$");
        // `Component.onCompleted` is the kernel's: every object has it.
        if type_name == "Component" {
            let value = self.handler(value, &[], span);
            built.attributes.push(b.attr(&name, value));
            return;
        }
        let Some(found) = self.types.find(parts) else {
            self.errors.push(Error::new(
                format!("`{type_name}` is not a type of anything the file imports"),
                span,
            ));
            return;
        };
        self.uses.origin(&type_name, &found.origin);
        if !built.attach.iter().any(|attached| *attached == type_name) {
            built.attach.push(type_name);
        }
        let attached = self.types.base(&found.kind).and_then(|ty| ty.0.attached());
        let handler = match rest {
            [name] => types::handled(name)
                .filter(|_| attached.is_none_or(|attached| attached.property(name).is_none())),
            _ => None,
        };
        let value = match handler {
            Some(signal) => {
                let parameters: Vec<String> = attached
                    .and_then(|attached| attached.signal(&signal))
                    .map(|signal| signal.parameters.iter().map(|name| (*name).to_string()).collect())
                    .unwrap_or_default();
                self.handler(value, &parameters, span)
            }
            None => {
                let property = attached.and_then(|attached| qt_property(attached, rest)).unwrap_or_else(types::no_property);
                self.value(value, property)
            }
        };
        built.attributes.push(b.attr(&name, value));
    }

    /// `width: 10` in a `PropertyChanges`: a binding of its target's while
    /// the state is the current one.
    fn change(&mut self, path: &[&'a str], value: QmlBindingValue<'a>, built: &mut Built<'a>, span: Span) {
        let b = self.b;
        // `rect.width: 10` names the object too.
        let (target, path) = match path {
            [target, rest @ ..] if !rest.is_empty() && self.tree.is_id(target) => (Some(*target), rest),
            path => (None, path),
        };
        // `Layout.preferredWidth: 10`: of the object the type attaches to
        // the target.
        let (attaching, path) = if path[0].starts_with(|c: char| c.is_ascii_uppercase()) {
            let qualified = path.len() > 2 && self.types.namespace(path[0]).is_some();
            let (parts, rest) = path.split_at(if qualified { 2 } else { 1 });
            let type_name = parts.join(".");
            let Some(found) = self.types.find(parts) else {
                self.errors.push(Error::new(
                    format!("`{type_name}` is not a type of anything the file imports"),
                    span,
                ));
                return;
            };
            self.uses.origin(&type_name, &found.origin);
            let attaching = match parts {
                [namespace, name] => b.member(b.id(namespace), name),
                _ => b.id(parts[0]),
            };
            (Some(attaching), rest)
        } else {
            (None, path)
        };
        // A target only the running program knows is given to what is
        // changed of it, for the names that are its own.
        let given: &[&str] = if self.tree.aimed(span.start) { &[names::TARGET] } else { &[] };
        let value = match value {
            QmlBindingValue::Expression(expression) => b.arrow(given, expression),
            QmlBindingValue::Statement(statement) => b.arrow_block(given, self.worth(statement)),
            value => {
                let value = self.value(value, types::no_property());
                b.arrow(given, value)
            }
        };
        let mut entry = vec![b.string(&path.join(".")), value];
        match (target, &attaching) {
            (Some(target), _) => entry.push(b.arrow(&[], b.id(target))),
            (None, Some(_)) => entry.push(b.null()),
            (None, None) => {}
        }
        entry.extend(attaching);
        built.changes.push(b.array(entry));
    }

    fn property(&mut self, property: QmlPropertyDeclaration<'a>, built: &mut Built<'a>) {
        let b = self.b;
        let name = property.name.name.as_str();
        let span = property.span;
        let Some(type_name) = property.type_name else {
            // `required name`: an inherited property, asked of whoever makes
            // the object.
            built.required.push(name.to_string());
            return;
        };
        let declared = type_name.name.to_string();
        if declared == "alias" {
            let path = match &property.value {
                Some(QmlBindingValue::Expression(expression)) => self.alias(expression),
                _ => None,
            };
            match path {
                Some(path) => built.aliases.push((name.to_string(), path)),
                None => self.errors.push(Error::new(
                    format!("`{name}` is an alias of nothing: an alias names an id, or a property of one"),
                    span,
                )),
            }
            return;
        }
        let initial = match typed(&declared, type_name.is_list) {
            Some(kind) => {
                self.uses.kernel.insert(kind);
                b.id(kind)
            }
            None => default_of(b, &declared, type_name.is_list),
        };
        built.properties.push((name.to_string(), initial));
        if property.is_required {
            built.required.push(name.to_string());
        }
        if let Some(value) = property.value {
            if self.makes(&value) {
                built.made.push(name.to_string());
            }
            let value = self.value(value, types::declared_property(&declared, type_name.is_list));
            built.attributes.push(b.attr(name, value));
        }
    }

    /// `label.font.bold` as `[label, "font", "bold"]`.
    fn alias(&mut self, expression: &Expression<'a>) -> Option<Expression<'a>> {
        let b = self.b;
        let mut names = Vec::new();
        let mut current = expression;
        loop {
            match current {
                Expression::StaticMemberExpression(member) => {
                    names.push(member.property.name.as_str());
                    current = &member.object;
                }
                Expression::Identifier(id) => {
                    names.push(id.name.as_str());
                    break;
                }
                _ => return None,
            }
        }
        let target = names.pop()?;
        if !self.tree.is_id(target) {
            return None;
        }
        let mut path = vec![b.id(target)];
        path.extend(names.iter().rev().map(|name| b.string(name)));
        Some(b.array(path))
    }

    fn function(&mut self, mut function: ArenaBox<'a, Function<'a>>, index: usize, built: &mut Built<'a>) {
        let Some(name) = function.id.as_ref().map(|id| id.name.to_string()) else { return };
        function.r#type = FunctionType::FunctionExpression;
        let mut expression = Expression::FunctionExpression(function);
        // In a `Connections`, `function onClicked() { }` is a handler of its
        // target's signal.
        if self.is_class(index, "QQmlConnections")
            && let Some(signal) = types::handled(&name)
        {
            let tree = self.tree;
            // What the signal carries is known of a target named by its id.
            if let Some(target) = tree.target(index)
                && let Some(property) = tree.carried(self.types, target, &signal)
            {
                self.told(&mut expression, &[tree.handle(target), property]);
            }
            built.attributes.push(self.b.attr(&name, expression));
        } else {
            built.functions.push((name, expression));
        }
    }

    fn is_class(&self, index: usize, class: &str) -> bool {
        self.tree.objects[index]
            .kind
            .as_ref()
            .and_then(|kind| self.types.base(kind))
            .is_some_and(|ty| ty.0.class == class)
    }

    /// What a handler is: a function of the signal's arguments, by the names
    /// the signal gives them.
    fn handler(&mut self, value: QmlBindingValue<'a>, parameters: &[String], span: Span) -> Expression<'a> {
        let b = self.b;
        // An argument Qt gives no name still has its place.
        let unnamed: Vec<String> = (0..parameters.len()).map(|index| format!("$argument{index}")).collect();
        let parameters: Vec<&str> = parameters
            .iter()
            .zip(&unnamed)
            .map(|(name, unnamed)| if name.is_empty() { unnamed.as_str() } else { name.as_str() })
            .collect();
        match value {
            // `onClicked: (mouse) => ...` says what its arguments are itself.
            QmlBindingValue::Expression(
                expression @ (Expression::FunctionExpression(_) | Expression::ArrowFunctionExpression(_)),
            ) => expression,
            QmlBindingValue::Expression(expression) => b.arrow(&parameters, expression),
            QmlBindingValue::Statement(statement) => b.arrow_block(&parameters, self.statements(statement)),
            QmlBindingValue::Object(_) | QmlBindingValue::Objects(_) => {
                self.errors.push(Error::new("a handler is a script, not an object", span));
                b.void_0()
            }
        }
    }

    /// `(text = label.text) => ...`: a handler of a change Qt tells with what
    /// the property now is. The runtime tells of a property's change and of
    /// nothing more, so the argument is the property when nothing is given;
    /// a signal the runtime emits itself gives what it carries.
    fn told(&mut self, handler: &mut Expression<'a>, path: &[&str]) {
        let b = self.b;
        let parameters = match handler {
            Expression::ArrowFunctionExpression(arrow) => &mut arrow.params,
            Expression::FunctionExpression(function) => &mut function.params,
            _ => return,
        };
        let Some(parameter) = parameters.items.first_mut() else { return };
        if parameter.initializer.is_some() || !matches!(parameter.pattern, BindingPattern::BindingIdentifier(_)) {
            return;
        }
        let Some((object, rest)) = path.split_first() else { return };
        self.uses.handles.insert((*object).to_string());
        let value = rest.iter().fold(b.id(object), |value, name| b.member(value, name));
        parameter.initializer = Some(ArenaBox::new_in(value, &b.allocator()));
    }

    fn statements(&self, statement: Statement<'a>) -> ArenaVec<'a, Statement<'a>> {
        match statement {
            Statement::BlockStatement(block) => block.unbox().body,
            statement => self.b.vec1(statement),
        }
    }

    /// The body of a function that gives what the script is worth.
    fn worth(&self, statement: Statement<'a>) -> ArenaVec<'a, Statement<'a>> {
        let mut statements = self.statements(statement);
        if let Some(last) = statements.last_mut() {
            self.b.returning(last);
        }
        statements
    }

    fn value(&mut self, value: QmlBindingValue<'a>, property: Property) -> Expression<'a> {
        let b = self.b;
        match value {
            // A script is a function of nothing, run when its time comes.
            QmlBindingValue::Expression(expression) if property.is_script => b.arrow(&[], expression),
            QmlBindingValue::Statement(statement) if property.is_script => {
                b.arrow_block(&[], self.statements(statement))
            }
            QmlBindingValue::Expression(expression) if property.is_url => self.url(expression),
            // A block that works a URL out is as relative to the file as one
            // that is written.
            QmlBindingValue::Statement(statement) if property.is_url => {
                let worth = b.iife(self.worth(statement));
                self.url(worth)
            }
            QmlBindingValue::Expression(expression) if property.takes_key => self.key(expression),
            // The name of a QML file is that file to whatever loads one; a
            // string holds the name. As what was not written, it stays one.
            QmlBindingValue::Expression(Expression::StringLiteral(mut literal)) if property.is_text => {
                literal.span = Span::default();
                Expression::StringLiteral(literal)
            }
            QmlBindingValue::Expression(expression) => expression,
            // A block is the body of a function whose result is the value.
            QmlBindingValue::Statement(statement) => b.iife(self.worth(statement)),
            // `transitions: Transition { }` is a list of one.
            QmlBindingValue::Object(object) if property.is_list => b.array([self.object_value(object)]),
            QmlBindingValue::Object(object) => self.object_value(object),
            QmlBindingValue::Objects(objects) => {
                let objects: Vec<_> = objects.into_iter().map(|object| self.object_value(object)).collect();
                b.array(objects)
            }
        }
    }

    /// `Text.AlignHCenter` written for an enum or an `int` is the number it
    /// stands for, as Qt takes it: a constant, where anything else written
    /// there is a binding to evaluate. It is read where the object is made
    /// and not by the module, which may name a type the runtime does not
    /// have in an object nothing makes.
    fn key(&mut self, expression: Expression<'a>) -> Expression<'a> {
        let b = self.b;
        let Expression::StaticMemberExpression(member) = &expression else { return expression };
        let key = member.property.name.as_str();
        let mut path = Vec::new();
        let mut object = &member.object;
        loop {
            match object {
                Expression::StaticMemberExpression(inner) => {
                    path.push(inner.property.name.as_str());
                    object = &inner.object;
                }
                Expression::Identifier(identifier) => {
                    path.push(identifier.name.as_str());
                    break;
                }
                _ => return expression,
            }
        }
        path.reverse();
        // `T.Label.ElideRight`: a type of a namespace is named by both, and
        // Qt looks no key up through one. That is a binding like any other,
        // whose handler is told of what it comes to.
        if self.types.namespace(path[0]).is_some() {
            return expression;
        }
        // `ListView.SnapMode.SnapOneItem`: the key by the name of its enum.
        let (name, scope) = match path[..] {
            [name] => (name, None),
            [name, scope] => (name, Some(scope)),
            _ => return expression,
        };
        let is_key = key.starts_with(|c: char| c.is_ascii_uppercase())
            && match self.types.find(&[name]) {
                Some(found) => self.types.is_key(&found.kind, scope, key),
                None => name == "Qt" && scope.is_none(),
            };
        if !is_key {
            return expression;
        }
        let constant = format!("{name}${key}");
        if !self.keys.iter().any(|keys| keys.contains(&constant)) {
            self.frame().push(b.const_(&constant, expression));
            self.keys.last_mut().expect("a frame is open").insert(constant.clone());
        }
        b.id(&constant)
    }

    /// The directory of the file `file`, from this one's; None when it is
    /// this one's own.
    fn towards(&self, file: &str) -> Option<String> {
        let path = types::relative(self.types.file, file);
        // A file of Qt's own is not beside this one, wherever it is served.
        let (directory, _) = path.rsplit_once('/').filter(|_| !path.starts_with('/'))?;
        (directory != ".").then(|| format!("{}/", directory.strip_prefix("./").unwrap_or(directory)))
    }

    /// A URL is relative to the file it is written in, which only the
    /// compiled module knows: `import.meta.url`. One given to a property a
    /// component in another directory uses is relative to that (`home`).
    fn url(&mut self, expression: Expression<'a>) -> Expression<'a> {
        let b = self.b;
        let Expression::StringLiteral(literal) = &expression else {
            if is_resolved(&expression) {
                return expression;
            }
            self.uses.kernel.insert("$url");
            let base = match &self.home {
                Some(home) => b.member(b.new_(b.id("URL"), [b.string(home), b.import_meta_url()]), "href"),
                None => b.import_meta_url(),
            };
            return b.call(b.id("$url"), [expression, base]);
        };
        let value = literal.value.as_str();
        if value.is_empty() || is_absolute(value) {
            return expression;
        }
        let moved = self.home.as_ref().map(|home| format!("{home}{value}"));
        let value = moved.as_deref().unwrap_or(value);
        let picture = self.uses.paths.picture(value);
        let value = picture.as_deref().unwrap_or(value);
        // A QML file is the component it was compiled to, and what that
        // makes finds names where the path is written.
        let scope =
            (!self.dynamic.is_empty()).then(|| self.tree.scope_of(self.tree.object_at(literal.span.start)));
        let Uses { paths, kernel, handles, .. } = &mut self.uses;
        if let Some(component) = paths.literal(b, kernel, value, scope.as_deref()) {
            handles.extend(scope);
            return component;
        }
        if let Some(index) = self.urls.iter().position(|url| url == value) {
            return b.id(&format!("$url{}", index + 1));
        }
        self.urls.push(value.to_string());
        let name = format!("$url{}", self.urls.len());
        // A shader is baked from its source when the program is built, as
        // Qt's build does: the build has it, and no file need be there.
        if value.ends_with(".qsb") {
            let relative = value.starts_with("./") || value.starts_with("../");
            let source = if relative { value.to_string() } else { format!("./{value}") };
            self.module.push(b.import_default(&name, &source));
            return b.id(&name);
        }
        // A directory is no asset: a bundler that takes `new URL` for one
        // gives it back without the slash it ends with.
        let url = if value.ends_with('/') {
            self.uses.kernel.insert("$url");
            b.call(b.id("$url"), [b.string(value), b.import_meta_url()])
        } else {
            b.member(b.new_(b.id("URL"), [b.string(value), b.import_meta_url()]), "href")
        };
        self.module.push(b.const_(&name, url));
        b.id(&name)
    }
}

fn qt_property(ty: &'static qt_types::Type, path: &[&str]) -> Option<Property> {
    let (first, rest) = path.split_first()?;
    let mut property = types::qt_property(ty.property(first)?);
    for name in rest {
        property = types::qt_property(property.value?.0.property(name)?);
    }
    Some(property)
}

/// The runtime's name for a property of a type that what it is given is
/// made into: `property int hours` holds an int, whatever it is assigned.
fn typed(type_name: &str, is_list: bool) -> Option<&'static str> {
    if is_list {
        return None;
    }
    match type_name {
        "int" => Some("$int"),
        "real" | "double" | "float" => Some("$real"),
        "bool" => Some("$bool"),
        "string" => Some("$string"),
        "color" => Some("$color"),
        _ => None,
    }
}

/// What a declared property of any other type is before anything is bound
/// to it.
fn default_of<'a>(b: B<'a>, type_name: &str, is_list: bool) -> Expression<'a> {
    if is_list {
        return b.array([]);
    }
    match type_name {
        "url" => b.string(""),
        // An object that is not there yet.
        name if name.starts_with(|c: char| c.is_ascii_uppercase()) => b.null(),
        _ => b.void_0(),
    }
}

/// `default property list<QtObject> things`: the property an instance's
/// children are the value of, and whether it is a list. An alias names where
/// they go instead.
fn default_property(root: &QmlObject<'_>) -> Option<(String, bool)> {
    root.members.iter().find_map(|member| {
        let QmlMember::Property(property) = member else { return None };
        let type_name = property.type_name.as_ref()?;
        (property.is_default && type_name.name.to_string() != "alias")
            .then(|| (property.name.name.to_string(), type_name.is_list))
    })
}

/// `default property alias content: column.children`: the object the
/// children of an instance are children of.
fn children_target(root: &QmlObject<'_>) -> Option<String> {
    root.members.iter().find_map(|member| {
        let QmlMember::Property(property) = member else { return None };
        if !property.is_default {
            return None;
        }
        let mut target = match property.value.as_ref()? {
            QmlBindingValue::Expression(expression) => expression,
            _ => return None,
        };
        while let Expression::StaticMemberExpression(member) = target {
            target = &member.object;
        }
        match target {
            Expression::Identifier(id) => Some(id.name.to_string()),
            _ => None,
        }
    })
}

/// Whether a script names `name`.
fn mentions(value: &QmlBindingValue<'_>, name: &str) -> bool {
    struct Mentions<'n> {
        name: &'n str,
        found: bool,
    }
    impl<'a> Visit<'a> for Mentions<'_> {
        fn visit_identifier_reference(&mut self, identifier: &IdentifierReference<'a>) {
            self.found |= identifier.name == self.name;
        }
    }
    let mut mentions = Mentions { name, found: false };
    match value {
        QmlBindingValue::Expression(expression) => mentions.visit_expression(expression),
        QmlBindingValue::Statement(statement) => mentions.visit_statement(statement),
        QmlBindingValue::Object(_) | QmlBindingValue::Objects(_) => {}
    }
    mentions.found
}
