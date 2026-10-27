//! What the QML files of a directory say about each other.
//!
//! A component is compiled on its own, but what it has to accept is decided by
//! the files that use it: QML lets an instance set any property of the
//! component's root object, add children to it and handle its signals. Rather
//! than have every component accept everything at run time, the instances are
//! read first. A component then takes exactly the properties some instance
//! sets, and everything else stays as static as it was written.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use oxc_allocator::Allocator;
use oxc_ast::ast::{CallExpression, Expression, IdentifierReference};
use oxc_ast_visit::{Visit, walk};
use qml_syntax::ast::*;

use crate::{
    Error, qt,
    quick::texts,
    registry::{Element, Prop, Types},
    scope::{Own, alias_target, classify, object_id},
};

/// The components a file can name: its own inline components and the files
/// next to it.
#[derive(Debug, Clone, Default)]
pub struct Project {
    files: HashMap<String, Summary>,
    /// The project's own modules: what `import Thermostat` brings, by the
    /// name of each type and the file it is.
    modules: HashMap<String, HashMap<String, String>>,
    /// The modules each file is a type of.
    memberships: HashMap<String, Vec<String>>,
    /// The files that stand in for a type the program has in C++.
    standins: HashSet<String>,
    /// The files the program keeps inside itself, by what it names each by
    /// (`qrc:/qt/qml/Thermostat/images/icon.png`): where each is, from the
    /// directory of the file compiled.
    resources: BTreeMap<String, String>,
}

/// A file's component or one of its inline components.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct Key {
    pub file: String,
    pub inline: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct Summary {
    components: Vec<Interface>,
    instances: Vec<Instance>,
    /// What the file imports, in the order it does.
    pub imports: Vec<Import>,
    /// `pragma Singleton`: the file is one object, not a type to instantiate.
    pub is_singleton: bool,
    shapes: Vec<Shape>,
}

/// One `import` of a file.
#[derive(Debug, Clone)]
pub(crate) struct Import {
    pub source: Source,
    /// `import QtQuick.Controls as C`: its types are `C.Button`.
    pub alias: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Source {
    /// A module, by its URI.
    Module(String),
    /// A directory or a JavaScript file, as written.
    Path(String),
}

/// What a component declares, by name, for the files that use it: an instance
/// is an object of the root's type with these members too.
#[derive(Debug, Clone)]
pub(crate) struct Shape {
    inline: Option<String>,
    /// The type of the root object, as written.
    pub root: Vec<String>,
    pub properties: HashMap<String, Declaration>,
    /// A signal's parameter names.
    pub signals: HashMap<String, Vec<String>>,
    pub functions: HashSet<String>,
    /// The properties whoever makes the object has to set, the inherited ones
    /// the component asks for (`required name`) among them.
    pub required: Vec<String>,
    /// Objects written inside an instance go somewhere the component says,
    /// not where its root type would put them.
    pub has_default: bool,
    /// `enum Theme { Light, Dark }`: the keys of each.
    pub enums: HashMap<String, Vec<String>>,
    /// The ids of its objects.
    pub ids: HashSet<String>,
    /// The names its scripts use that nothing in it declares: members of
    /// Qt's types, mostly.
    pub mentions: HashSet<String>,
    /// The names the QML it gives `Qt.createQmlObject` as a text uses and
    /// does not declare: what is in sight where the text is written, which
    /// is where its object looks for them.
    pub sought: HashSet<String>,
}

/// A `property` declaration, as far as an instance cares.
#[derive(Debug, Clone)]
pub(crate) struct Declaration {
    /// `int`, `var`, `alias`, `Component`, `Item`.
    pub type_name: String,
    pub is_list: bool,
    /// What an alias is an alias of: the type of the object it names, as
    /// written, and the property of that object, where it names one.
    pub alias: Option<(Vec<String>, Vec<String>)>,
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

    /// Adds the file of the component `name`. A file that does not parse is
    /// left out, and its errors returned.
    pub fn add(&mut self, name: &str, source: &str) -> Result<(), Vec<Error>> {
        let allocator = Allocator::default();
        let parsed = qml_syntax::parse(&allocator, source);
        if !parsed.diagnostics.is_empty() {
            return Err(parsed.diagnostics.into_iter().map(Error::from).collect());
        }
        self.insert(name, summarize(&parsed.document));
        Ok(())
    }

    /// The directories the files import by path (`import "content"`), as the
    /// keys their files are to be added under: `content` for `content/Clock`.
    /// What is in them may import others, so this is asked again after they
    /// are added.
    pub fn directories(&self) -> Vec<String> {
        let mut directories = BTreeSet::new();
        for (file, summary) in &self.files {
            for import in &summary.imports {
                if let Source::Path(path) = &import.source
                    && !path.ends_with(".js")
                    && !path.ends_with(".mjs")
                {
                    directories.insert(join(directory(file), path));
                }
            }
        }
        directories.into_iter().collect()
    }

    /// Says the module `uri` has the type `name`, which is the file `file`:
    /// what a `qmldir` says, or the build that makes the module.
    pub fn add_type(&mut self, uri: &str, name: &str, file: &str) {
        self.modules.entry(uri.to_string()).or_default().insert(name.to_string(), file.to_string());
        let memberships = self.memberships.entry(file.to_string()).or_default();
        if !memberships.iter().any(|module| module == uri) {
            memberships.push(uri.to_string());
        }
    }

    /// Says the program keeps the file at `path` inside itself, and names it
    /// by `address`: what the build that makes a module says of the files
    /// that go with it.
    pub fn add_resource(&mut self, address: &str, path: &str) {
        self.resources.insert(address.to_string(), path.to_string());
    }

    /// The files kept in the program that `address` names: the one it is
    /// the name of, or else, as it may be the start of a name put together
    /// when the program runs, every one whose name starts so.
    pub(crate) fn resources(&self, address: &str) -> Vec<(&String, &String)> {
        match self.resources.get_key_value(address) {
            Some(one) => vec![one],
            None => self.resources.range(address.to_string()..).take_while(|(name, _)| name.starts_with(address)).collect(),
        }
    }

    /// Says `file` stands in for a type the program has in C++: what it is
    /// given is taken as such a type takes it.
    pub fn stand_in(&mut self, file: &str) {
        self.standins.insert(file.to_string());
    }

    pub(crate) fn stands_in(&self, file: &str) -> bool {
        self.standins.contains(file)
    }

    /// The modules `file` is a type of: it sees their other types as it sees
    /// the files next to it.
    pub(crate) fn modules_of(&self, file: &str) -> &[String] {
        self.memberships.get(file).map_or(&[], Vec::as_slice)
    }

    /// Whether the file was added, and parsed.
    pub fn has(&self, file: &str) -> bool {
        self.files.contains_key(file)
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
        let mut has: HashSet<&str> = HashSet::new();
        for shape in self.files.values().flat_map(|summary| &summary.shapes) {
            has.extend(shape.ids.iter().map(String::as_str));
            let declared =
                shape.properties.keys().chain(shape.signals.keys()).chain(&shape.functions).map(String::as_str);
            has.extend(declared.filter(|name| !qt::is_member_name(name)));
        }
        // What a text is to find where it is written is whatever is there
        // by that name.
        let mut there: HashSet<&str> = HashSet::new();
        for shape in self.files.values().flat_map(|summary| &summary.shapes) {
            there.extend(shape.ids.iter().map(String::as_str));
            there.extend(shape.properties.keys().chain(shape.signals.keys()).chain(&shape.functions).map(String::as_str));
        }
        self.files
            .values()
            .flat_map(|summary| &summary.shapes)
            .flat_map(|shape| {
                let mentioned = shape.mentions.iter().filter(|name| has.contains(name.as_str()));
                mentioned.chain(shape.sought.iter().filter(|name| there.contains(name.as_str())))
            })
            .cloned()
            .collect()
    }

    /// The names the scripts of `file` use that nothing in it declares.
    pub(crate) fn mentions(&self, file: &str) -> impl Iterator<Item = &String> {
        self.files.get(file).into_iter().flat_map(|summary| &summary.shapes).flat_map(|shape| &shape.mentions)
    }

    /// The file the type `name` of the project's module `uri` is.
    pub(crate) fn module_type(&self, uri: &str, name: &str) -> Option<&str> {
        self.modules.get(uri)?.get(name).map(String::as_str)
    }

    pub(crate) fn insert(&mut self, name: &str, summary: Summary) {
        self.files.insert(name.to_string(), summary);
    }

    /// The component a type name stands for in `file`.
    pub(crate) fn resolve(&self, file: &str, type_name: &str) -> Option<Key> {
        let inline = self.files.get(file).is_some_and(|summary| {
            summary.components.iter().any(|component| component.inline.as_deref() == Some(type_name))
        });
        if inline {
            Some(Key { file: file.to_string(), inline: Some(type_name.to_string()) })
        } else if self.files.contains_key(type_name) {
            Some(Key { file: type_name.to_string(), inline: None })
        } else {
            None
        }
    }

    pub(crate) fn summary(&self, file: &str) -> Option<&Summary> {
        self.files.get(file)
    }

    pub(crate) fn shape(&self, key: &Key) -> Option<&Shape> {
        self.files.get(&key.file)?.shapes.iter().find(|shape| shape.inline == key.inline)
    }

    pub(crate) fn interface(&self, key: &Key) -> Option<&Interface> {
        self.files.get(&key.file)?.components.iter().find(|component| component.inline == key.inline)
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
        for (file, summary) in &self.files {
            for instance in &summary.instances {
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
            for (file, summary) in &self.files {
                for instance in summary.instances.iter().filter(|instance| instance.is_root) {
                    let owner = Key { file: file.clone(), inline: instance.owner.clone() };
                    let Some(root) = self.resolve(file, &instance.type_name) else { continue };
                    let (Some(interface), Some(asked)) = (self.interface(&owner), usages.get(&owner))
                    else {
                        continue;
                    };
                    if root == owner {
                        continue;
                    }
                    let names: Vec<String> = asked
                        .names
                        .iter()
                        .filter(|name| interface.declares(name).is_none())
                        .cloned()
                        .collect();
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

pub(crate) fn summarize(document: &QmlDocument<'_>) -> Summary {
    let mut summary = Summary::default();
    let types = Types::of(&document.imports);
    component(&mut summary, types, None, &document.root);
    summary.imports = document
        .imports
        .iter()
        .map(|import| Import {
            source: match &import.source {
                QmlImportSource::Module(module) => Source::Module(module.to_string()),
                QmlImportSource::Path(path) => Source::Path((*path).to_string()),
            },
            alias: import.alias.as_ref().map(|alias| alias.name.to_string()),
        })
        .collect();
    summary.is_singleton = document.pragmas.iter().any(|pragma| pragma.name == "Singleton");
    shape(&mut summary, None, &document.root);
    summary
}

fn shape(summary: &mut Summary, inline: Option<&str>, root: &QmlObject<'_>) {
    let mut shape = Shape {
        inline: inline.map(str::to_string),
        root: root.type_name.parts.iter().map(|part| (*part).to_string()).collect(),
        properties: HashMap::new(),
        signals: HashMap::new(),
        functions: HashSet::new(),
        required: Vec::new(),
        has_default: false,
        enums: HashMap::new(),
        ids: HashSet::new(),
        mentions: HashSet::new(),
        sought: HashSet::new(),
    };
    let mut names = Names {
        ids: HashSet::new(),
        typed: HashMap::new(),
        declared: HashSet::new(),
        mentions: HashSet::new(),
        sought: HashSet::new(),
    };
    names.object(root);
    shape.sought = std::mem::take(&mut names.sought);
    shape.mentions =
        names.mentions.into_iter().filter(|name| !names.ids.contains(name) && !names.declared.contains(name)).collect();
    shape.ids = names.ids;
    let typed = names.typed;
    for member in &root.members {
        match member {
            QmlMember::Property(property) => {
                let name = property.name.name.to_string();
                if property.is_required {
                    shape.required.push(name.clone());
                }
                shape.has_default |= property.is_default;
                if let Some(type_name) = &property.type_name {
                    let alias = match &property.value {
                        Some(QmlBindingValue::Expression(expression)) if type_name.name.to_string() == "alias" => {
                            dotted(expression).and_then(|path| {
                                let (id, rest) = path.split_first()?;
                                Some((typed.get(id)?.clone(), rest.to_vec()))
                            })
                        }
                        _ => None,
                    };
                    shape.properties.insert(
                        name,
                        Declaration { type_name: type_name.name.to_string(), is_list: type_name.is_list, alias },
                    );
                }
            }
            QmlMember::Signal(signal) => {
                shape.signals.insert(
                    signal.name.name.to_string(),
                    signal.params.iter().map(|param| param.name.name.to_string()).collect(),
                );
            }
            QmlMember::Function(function) => {
                if let Some(id) = &function.id {
                    shape.functions.insert(id.name.to_string());
                }
            }
            QmlMember::Enum(declaration) => {
                shape.enums.insert(
                    declaration.name.name.to_string(),
                    declaration.members.iter().map(|member| member.name.name.to_string()).collect(),
                );
            }
            _ => {}
        }
    }
    summary.shapes.push(shape);
    inline_shapes(summary, root);
}

/// `image.source`: the names of a path that is written with nothing else.
fn dotted(expression: &Expression<'_>) -> Option<Vec<String>> {
    match expression {
        Expression::Identifier(id) => Some(vec![id.name.to_string()]),
        Expression::StaticMemberExpression(member) => {
            let mut path = dotted(&member.object)?;
            path.push(member.property.name.to_string());
            Some(path)
        }
        _ => None,
    }
}

/// The ids of a component's objects and the names its scripts use. An inline
/// component is one of its own.
struct Names {
    ids: HashSet<String>,
    /// The type each id is the id of, as written.
    typed: HashMap<String, Vec<String>>,
    /// What any of its objects declares.
    declared: HashSet<String>,
    mentions: HashSet<String>,
    /// See [`Shape::sought`].
    sought: HashSet<String>,
}

impl Names {
    fn object(&mut self, object: &QmlObject<'_>) {
        for member in &object.members {
            match member {
                QmlMember::Property(property) => {
                    self.declared.insert(property.name.name.to_string());
                }
                QmlMember::Signal(signal) => {
                    self.declared.insert(signal.name.name.to_string());
                }
                QmlMember::Function(function) => {
                    self.declared.extend(function.id.as_ref().map(|id| id.name.to_string()));
                }
                _ => {}
            }
            match member {
                QmlMember::Object(child) => self.object(child),
                QmlMember::Binding(QmlBinding {
                    name,
                    value: QmlBindingValue::Expression(Expression::Identifier(id)),
                    ..
                }) if name.as_simple() == Some("id") => {
                    self.ids.insert(id.name.to_string());
                    self.typed
                        .insert(id.name.to_string(), object.type_name.parts.iter().map(|part| (*part).to_string()).collect());
                }
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

impl<'a> Visit<'a> for Names {
    fn visit_identifier_reference(&mut self, identifier: &IdentifierReference<'a>) {
        if identifier.name.starts_with(|c: char| c.is_ascii_lowercase() || c == '_') {
            self.mentions.insert(identifier.name.to_string());
        }
    }

    fn visit_call_expression(&mut self, call: &CallExpression<'a>) {
        if let Some(text) = texts::given(call).and_then(texts::written) {
            let allocator = Allocator::default();
            let parsed = qml_syntax::parse(&allocator, &text.0);
            if parsed.diagnostics.is_empty() {
                for shape in summarize(&parsed.document).shapes {
                    self.sought.extend(shape.mentions);
                    self.sought.extend(shape.sought);
                }
            }
        }
        walk::walk_call_expression(self, call);
    }
}

/// Inline components may be declared anywhere in the file.
fn inline_shapes(summary: &mut Summary, object: &QmlObject<'_>) {
    for member in &object.members {
        match member {
            QmlMember::Object(child) => inline_shapes(summary, child),
            QmlMember::Binding(QmlBinding { value, .. })
            | QmlMember::Property(QmlPropertyDeclaration { value: Some(value), .. }) => match value {
                QmlBindingValue::Object(child) => inline_shapes(summary, child),
                QmlBindingValue::Objects(children) => {
                    for child in children {
                        inline_shapes(summary, child);
                    }
                }
                _ => {}
            },
            QmlMember::InlineComponent(inline) => {
                shape(summary, Some(inline.name.name.as_str()), &inline.object);
            }
            _ => {}
        }
    }
}

/// The aliases of the component being walked: they make its interface reach
/// the objects they name.
struct Aliases<'a> {
    inline: Option<&'a str>,
    properties: Vec<(&'a str, String)>,
    children: Option<&'a str>,
}

fn component<'a>(summary: &mut Summary, types: Types, inline: Option<&'a str>, root: &QmlObject<'a>) {
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
    summary.components.push(interface);
    object(summary, types, &aliases, root, true);
}

fn object<'a>(
    summary: &mut Summary,
    types: Types,
    aliases: &Aliases<'a>,
    object: &QmlObject<'a>,
    is_root: bool,
) {
    if let Some(type_name) = object.type_name.as_simple()
        && types.lookup(type_name).is_none()
        && object.on.is_none()
    {
        summary.instances.push(instance(aliases, type_name, object, is_root));
    }
    for member in &object.members {
        match member {
            QmlMember::Object(child) if !is_group(child) => {
                self::object(summary, types, aliases, child, false);
            }
            QmlMember::Binding(QmlBinding { value, .. })
            | QmlMember::Property(QmlPropertyDeclaration { value: Some(value), .. }) => match value {
                QmlBindingValue::Object(child) => self::object(summary, types, aliases, child, false),
                QmlBindingValue::Objects(children) => {
                    for child in children {
                        self::object(summary, types, aliases, child, false);
                    }
                }
                _ => {}
            },
            QmlMember::InlineComponent(inline) => {
                component(summary, types, Some(inline.name.name.as_str()), &inline.object);
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

/// `font { ... }`: an object whose "type" is a lowercase property name.
pub(crate) fn is_group(object: &QmlObject<'_>) -> bool {
    object.type_name.parts[0].starts_with(|c: char| c.is_ascii_lowercase())
}

/// The directory of a file's key: `content` of `content/Clock`.
pub(crate) fn directory(file: &str) -> &str {
    file.rsplit_once('/').map_or("", |(directory, _)| directory)
}

/// `path` from `directory`, without `.` and with `..` taken up where it can be.
pub(crate) fn join(directory: &str, path: &str) -> String {
    let absolute = path.starts_with('/') || directory.starts_with('/');
    let mut parts: Vec<&str> = if path.starts_with('/') {
        Vec::new()
    } else {
        directory.split('/').filter(|part| !part.is_empty()).collect()
    };
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." if parts.last().is_some_and(|last| *last != "..") => {
                parts.pop();
            }
            part => parts.push(part),
        }
    }
    let joined = parts.join("/");
    if absolute { format!("/{joined}") } else { joined }
}
