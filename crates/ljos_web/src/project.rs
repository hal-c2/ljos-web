//! What the QML files of a directory say about each other.
//!
//! The project graph itself is Ljós's ([`qml_front::project::Project`]):
//! which files there are, what each imports and what each of its components
//! declares. What is kept here is only what the Solid lowering asks on top
//! of it. A component is compiled on its own, but what it has to accept is
//! decided by the files that use it: QML lets an instance set any property
//! of the component's root object, add children to it and handle its
//! signals. Rather than have every component accept everything at run time,
//! the instances are read first. A component then takes exactly the
//! properties some instance sets, and everything else stays as static as it
//! was written.

use std::collections::{BTreeSet, HashMap, HashSet};

use oxc_allocator::Allocator;
use oxc_ast::ast::CallExpression;
use oxc_ast_visit::{Visit, walk};
use qml_front::QtTypeOracle;
use qml_syntax::ast::*;

use crate::{
    Error,
    quick::texts,
    registry::{Element, Prop, Types},
    scope::{Own, alias_target, classify, object_id},
};

pub(crate) use qml_front::project::{Key, Source, Summary, summarize};
pub(crate) use qml_front::scope::is_group;

/// The components a file can name: its own inline components and the files
/// next to it. The files and what they declare are the front end's; the
/// interfaces and instances the dialect lowering reads are kept beside it,
/// by the key each file was added under.
#[derive(Debug, Clone, Default)]
pub struct Project {
    front: qml_front::project::Project,
    extras: HashMap<String, Extras>,
    /// The modules the project has, whether or not any of their types is QML.
    modules: HashSet<String>,
}

/// What one file asks of the components it uses, and what its own
/// components offer an instance: read from the file when it is added, as
/// the front end reads its summary.
#[derive(Debug, Clone, Default)]
struct Extras {
    components: Vec<Interface>,
    instances: Vec<Instance>,
    /// The names the QML it gives `Qt.createQmlObject` as a text uses and
    /// does not declare: what is in sight where the text is written, which
    /// is where its object looks for them.
    sought: HashSet<String>,
}

/// What a component declares: the names an instance may set that are the
/// component's own rather than its root object's.
#[derive(Debug, Clone)]
pub(crate) struct Interface {
    inline: Option<String>,
    root: Root,
    properties: HashSet<String>,
    signals: HashMap<String, Vec<String>>,
    /// Children given to an instance go into the root object, not into the
    /// target of a default property alias.
    children_in_root: bool,
}

#[derive(Debug, Clone)]
enum Root {
    Element(&'static Element),
    /// Another component, by the name the file knows it under.
    Component(String),
    Other,
}

/// One use of a type that is not a dialect's: a component instance.
#[derive(Debug, Clone)]
struct Instance {
    /// The inline component the instance is written in, if any.
    owner: Option<String>,
    /// The instance is its component's root object, so whatever the component
    /// does not declare itself is the instance's to take.
    is_root: bool,
    type_name: String,
    names: BTreeSet<String>,
    children: bool,
}

/// What the instances of a component ask of it.
#[derive(Debug, Clone, Default)]
pub(crate) struct Usage {
    pub names: BTreeSet<String>,
    pub children: bool,
}

pub(crate) enum Declared<'i> {
    Property,
    /// A handler of a declared signal, with the signal's parameter names.
    Signal(&'i [String]),
    /// A change handler of a declared property.
    Changed(String),
}

/// What a name means on an instance of a component.
pub(crate) enum Lookup {
    Value,
    /// A signal handler, with the names the signal gives its arguments.
    Handler(Vec<String>),
    /// A property of the root object whose value has to be known when the
    /// component is compiled.
    Fixed,
    Missing,
    /// The component, or the root type it ends in, is not in the project.
    Unknown,
}

impl Interface {
    pub(crate) fn declares(&self, name: &str) -> Option<Declared<'_>> {
        if self.properties.contains(name) {
            return Some(Declared::Property);
        }
        let own = classify(
            name,
            |signal| self.signals.contains_key(signal),
            |property| self.properties.contains(property),
        )?;
        match own {
            Own::Signal(signal) => Some(Declared::Signal(&self.signals[&signal])),
            Own::Changed(property) => Some(Declared::Changed(property)),
            Own::Completed | Own::Destruction => None,
        }
    }
}

impl Project {
    pub fn new() -> Self {
        Self::default()
    }

    /// The front end's project: what the shared reading of a file asks.
    pub(crate) fn front(&self) -> &qml_front::project::Project {
        &self.front
    }

    /// Adds the file of the component `name`. A file that does not parse is
    /// left out, and its errors returned.
    pub fn add(&mut self, name: &str, source: &str) -> Result<(), Vec<Error>> {
        let allocator = Allocator::default();
        let parsed = qml_syntax::parse(&allocator, source);
        if !parsed.diagnostics.is_empty() {
            self.front.remove(name);
            self.extras.remove(name);
            return Err(parsed.diagnostics.into_iter().map(Error::from).collect());
        }
        self.insert_document(name, &parsed.document);
        Ok(())
    }

    /// Adds a file that has been parsed, with what the lowering reads of it.
    pub(crate) fn insert_document(&mut self, name: &str, document: &QmlDocument<'_>) {
        self.front.insert(name, summarize(document));
        self.extras.insert(name.to_string(), extras(document));
    }

    /// The directories the files import by path (`import "content"`), as the
    /// keys their files are to be added under: `content` for `content/Clock`.
    /// What is in them may import others, so this is asked again after they
    /// are added.
    pub fn directories(&self) -> Vec<String> {
        self.front.directories()
    }

    /// Says the module `uri` has the type `name`, which is the file `file`:
    /// what a `qmldir` says, or the build that makes the module.
    pub fn add_type(&mut self, uri: &str, name: &str, file: &str) {
        self.front.add_type(uri, name, file);
    }

    /// Says the project has the module `uri`: a `qmldir` in its place, or a
    /// build that makes it, whose types may all be C++.
    pub fn add_module(&mut self, uri: &str) {
        self.modules.insert(uri.to_string());
    }

    /// Whether the project has the module `uri`.
    pub fn has_module(&self, uri: &str) -> bool {
        self.modules.contains(uri) || self.front.has_module(uri)
    }

    /// Says the program keeps the file at `path` inside itself, and names it
    /// by `address`: what the build that makes a module says of the files
    /// that go with it.
    pub fn add_resource(&mut self, address: &str, path: &str) {
        self.front.add_resource(address, path);
    }

    /// The files kept in the program that `address` names: the one it is
    /// the name of, or else, as it may be the start of a name put together
    /// when the program runs, every one whose name starts so.
    pub(crate) fn resources(&self, address: &str) -> Vec<(&String, &String)> {
        self.front.resources(address)
    }

    /// Says `file` stands in for a type the program has in C++: what it is
    /// given is taken as such a type takes it.
    pub fn stand_in(&mut self, file: &str) {
        self.front.stand_in(file);
    }

    /// Whether the file was added, and parsed.
    pub fn has(&self, file: &str) -> bool {
        self.front.has(file)
    }

    /// The names QML finds only when the program runs: an id of one
    /// component, or something its root declares, that another one's scripts
    /// use. An object is made in the context of whatever made it, and a name
    /// its own component does not have is looked for there.
    ///
    /// Which names those are is settled when each file is compiled; this is
    /// what they can be, so that the components between the two know to
    /// pass the context on. A name some type of Qt's has is taken to be
    /// that, unless it is an id: nobody names an object for a property.
    pub(crate) fn dynamic_names(&self) -> HashSet<String> {
        let mut names = self.front.dynamic_names(&QtTypeOracle);
        // What a text is to find where it is written is whatever is there
        // by that name.
        let mut there: HashSet<&str> = HashSet::new();
        for file in self.extras.keys() {
            let Some(summary) = self.front.summary(file) else { continue };
            for shape in &summary.shapes {
                there.extend(shape.ids.iter().map(String::as_str));
                there.extend(shape.properties.keys().chain(shape.signals.keys()).chain(&shape.functions).map(String::as_str));
            }
        }
        names.extend(
            self.extras
                .values()
                .flat_map(|extras| &extras.sought)
                .filter(|name| there.contains(name.as_str()))
                .cloned(),
        );
        names
    }

    /// The names the scripts of `file` use that nothing in it declares.
    pub(crate) fn mentions(&self, file: &str) -> impl Iterator<Item = &String> {
        self.front.mentions(file)
    }

    /// The file the type `name` of the project's module `uri` is.
    pub(crate) fn module_type(&self, uri: &str, name: &str) -> Option<&str> {
        self.front.module_type(uri, name)
    }

    /// The component a type name stands for in `file`.
    pub(crate) fn resolve(&self, file: &str, type_name: &str) -> Option<Key> {
        let inline = self
            .front
            .summary(file)
            .is_some_and(|summary| summary.shapes.iter().any(|shape| shape.inline.as_deref() == Some(type_name)));
        if inline {
            Some(Key { file: file.to_string(), inline: Some(type_name.to_string()) })
        } else if self.front.has(type_name) {
            Some(Key { file: type_name.to_string(), inline: None })
        } else {
            None
        }
    }

    pub(crate) fn summary(&self, file: &str) -> Option<&Summary> {
        self.front.summary(file)
    }

    pub(crate) fn interface(&self, key: &Key) -> Option<&Interface> {
        self.extras.get(&key.file)?.components.iter().find(|component| component.inline == key.inline)
    }

    /// What `name` is on an instance of the component: something it declares,
    /// or a property of its root object, however many components down that is.
    pub(crate) fn lookup(&self, key: &Key, name: &str) -> Lookup {
        let mut key = key.clone();
        // A component whose root is itself, by whatever detour, has no root.
        for _ in 0..64 {
            let Some(interface) = self.interface(&key) else { return Lookup::Unknown };
            match interface.declares(name) {
                Some(Declared::Property) => return Lookup::Value,
                Some(Declared::Signal(parameters)) => return Lookup::Handler(parameters.to_vec()),
                Some(Declared::Changed(_)) => return Lookup::Handler(Vec::new()),
                None => {}
            }
            match &interface.root {
                Root::Element(element) => {
                    return match element.prop(name) {
                        Some(Prop::Event(_)) => Lookup::Handler(Vec::new()),
                        Some(Prop::Keyword(_)) => Lookup::Fixed,
                        Some(_) => Lookup::Value,
                        None => Lookup::Missing,
                    };
                }
                Root::Component(type_name) => match self.resolve(&key.file, type_name) {
                    Some(root) => key = root,
                    None => return Lookup::Unknown,
                },
                Root::Other => return Lookup::Missing,
            }
        }
        Lookup::Missing
    }

    /// What the instances in the project ask of each component.
    pub(crate) fn usages(&self) -> HashMap<Key, Usage> {
        let mut usages: HashMap<Key, Usage> = HashMap::new();
        for (file, extras) in &self.extras {
            for instance in &extras.instances {
                let Some(key) = self.resolve(file, &instance.type_name) else { continue };
                let usage = usages.entry(key).or_default();
                usage.names.extend(instance.names.iter().cloned());
                usage.children |= instance.children;
            }
        }
        // What is asked of a component and is not its own is asked of its
        // root, when that is a component too. Usages only grow, so this ends.
        loop {
            let mut changed = false;
            for (file, extras) in &self.extras {
                for instance in extras.instances.iter().filter(|instance| instance.is_root) {
                    let owner = Key { file: file.clone(), inline: instance.owner.clone() };
                    let Some(root) = self.resolve(file, &instance.type_name) else { continue };
                    let (Some(interface), Some(asked)) = (self.interface(&owner), usages.get(&owner)) else {
                        continue;
                    };
                    if root == owner {
                        continue;
                    }
                    let names: Vec<String> =
                        asked.names.iter().filter(|name| interface.declares(name).is_none()).cloned().collect();
                    let children = asked.children && interface.children_in_root;
                    let usage = usages.entry(root).or_default();
                    for name in names {
                        changed |= usage.names.insert(name);
                    }
                    if children && !usage.children {
                        usage.children = true;
                        changed = true;
                    }
                }
            }
            if !changed {
                return usages;
            }
        }
    }
}

/// What the lowering reads of one file beside its front-end summary.
fn extras(document: &QmlDocument<'_>) -> Extras {
    let mut extras = Extras::default();
    let types = Types::of(&document.imports);
    component(&mut extras, types, None, &document.root);
    extras.sought = sought(document);
    extras
}

/// The names the QML a file gives `Qt.createQmlObject` as a text uses and
/// does not declare, through as many texts as it writes.
fn sought(document: &QmlDocument<'_>) -> HashSet<String> {
    let mut sought = Sought::default();
    sought.object(&document.root);
    sought.names
}

#[derive(Default)]
struct Sought {
    names: HashSet<String>,
}

impl Sought {
    fn object(&mut self, object: &QmlObject<'_>) {
        for member in &object.members {
            match member {
                QmlMember::Object(child) => self.object(child),
                QmlMember::InlineComponent(inline) => self.object(&inline.object),
                QmlMember::Binding(QmlBinding { value, .. })
                | QmlMember::Property(QmlPropertyDeclaration { value: Some(value), .. }) => match value {
                    QmlBindingValue::Expression(expression) => self.visit_expression(expression),
                    QmlBindingValue::Statement(statement) => self.visit_statement(statement),
                    QmlBindingValue::Object(child) => self.object(child),
                    QmlBindingValue::Objects(children) => {
                        for child in children {
                            self.object(child);
                        }
                    }
                },
                QmlMember::Function(function) => {
                    if let Some(body) = &function.body {
                        self.visit_function_body(body);
                    }
                }
                _ => {}
            }
        }
    }
}

impl<'a> Visit<'a> for Sought {
    fn visit_call_expression(&mut self, call: &CallExpression<'a>) {
        if let Some(text) = texts::given(call).and_then(texts::written) {
            let allocator = Allocator::default();
            let parsed = qml_syntax::parse(&allocator, &text.0);
            if parsed.diagnostics.is_empty() {
                for shape in summarize(&parsed.document).shapes {
                    self.names.extend(shape.mentions);
                }
                self.names.extend(sought(&parsed.document));
            }
        }
        walk::walk_call_expression(self, call);
    }
}


/// The aliases of the component being walked: they make its interface reach
/// the objects they name.
struct Aliases<'a> {
    inline: Option<&'a str>,
    properties: Vec<(&'a str, String)>,
    children: Option<&'a str>,
}

fn component<'a>(extras: &mut Extras, types: Types, inline: Option<&'a str>, root: &QmlObject<'a>) {
    let mut interface = Interface {
        inline: inline.map(str::to_string),
        root: match root.type_name.as_simple() {
            Some(name) => match types.element(name) {
                Some(element) => Root::Element(element),
                None if types.lookup(name).is_some() => Root::Other,
                None => Root::Component(name.to_string()),
            },
            None => Root::Other,
        },
        properties: HashSet::new(),
        signals: HashMap::new(),
        children_in_root: true,
    };
    let mut aliases = Aliases { inline, properties: Vec::new(), children: None };
    for member in &root.members {
        match member {
            QmlMember::Property(property) => {
                interface.properties.insert(property.name.name.to_string());
                let is_alias = property
                    .type_name
                    .as_ref()
                    .is_some_and(|type_name| type_name.name.as_simple() == Some("alias"));
                if let (true, Some((id, target))) = (is_alias, alias_target(property)) {
                    if property.is_default {
                        aliases.children = Some(id);
                        interface.children_in_root = false;
                    } else {
                        aliases.properties.push((id, target));
                    }
                }
            }
            QmlMember::Signal(signal) => {
                interface.signals.insert(
                    signal.name.name.to_string(),
                    signal.params.iter().map(|param| param.name.name.to_string()).collect(),
                );
            }
            _ => {}
        }
    }
    extras.components.push(interface);
    object(extras, types, &aliases, root, true);
}

fn object<'a>(
    extras: &mut Extras,
    types: Types,
    aliases: &Aliases<'a>,
    object: &QmlObject<'a>,
    is_root: bool,
) {
    if let Some(type_name) = object.type_name.as_simple()
        && types.lookup(type_name).is_none()
        && object.on.is_none()
    {
        extras.instances.push(instance(aliases, type_name, object, is_root));
    }
    for member in &object.members {
        match member {
            QmlMember::Object(child) if !is_group(child) => {
                self::object(extras, types, aliases, child, false);
            }
            QmlMember::Binding(QmlBinding { value, .. })
            | QmlMember::Property(QmlPropertyDeclaration { value: Some(value), .. }) => match value {
                QmlBindingValue::Object(child) => self::object(extras, types, aliases, child, false),
                QmlBindingValue::Objects(children) => {
                    for child in children {
                        self::object(extras, types, aliases, child, false);
                    }
                }
                _ => {}
            },
            QmlMember::InlineComponent(inline) => {
                component(extras, types, Some(inline.name.name.as_str()), &inline.object);
            }
            _ => {}
        }
    }
}

fn instance<'a>(
    aliases: &Aliases<'a>,
    type_name: &str,
    object: &QmlObject<'a>,
    is_root: bool,
) -> Instance {
    // What the object declares itself is its own, not the component's.
    let mut properties = HashSet::new();
    let mut signals = HashSet::new();
    for member in &object.members {
        match member {
            QmlMember::Property(property) => {
                properties.insert(property.name.name.as_str());
            }
            QmlMember::Signal(signal) => {
                signals.insert(signal.name.name.as_str());
            }
            _ => {}
        }
    }
    let passed = |name: &str| {
        name != "id"
            && classify(name, |signal| signals.contains(signal), |property| properties.contains(property))
                .is_none()
    };

    let mut names = BTreeSet::new();
    let mut children = false;
    for member in &object.members {
        match member {
            QmlMember::Binding(binding) => {
                let name = binding.name.to_string();
                if passed(&name) {
                    names.insert(name);
                }
            }
            QmlMember::Object(group) if is_group(group) => {
                for member in &group.members {
                    if let QmlMember::Binding(binding) = member {
                        names.insert(format!("{}.{}", group.type_name, binding.name));
                    }
                }
            }
            QmlMember::Object(_) => children = true,
            _ => {}
        }
    }
    if let Some(id) = object_id(object) {
        for (target, property) in &aliases.properties {
            if *target == id && !properties.contains(property.as_str()) {
                names.insert(property.clone());
            }
        }
        children |= aliases.children == Some(id);
    }
    Instance {
        owner: aliases.inline.map(str::to_string),
        is_root,
        type_name: type_name.to_string(),
        names,
        children,
    }
}
