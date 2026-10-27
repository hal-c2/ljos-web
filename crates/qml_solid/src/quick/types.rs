//! What a type name is in a file, and what an object of that type has.
//!
//! A name is looked up the way QML does: the file's inline components, then
//! its imports from the last to the first, then the files next to it. What
//! Qt's own types have comes from Qt's description of them ([`qt_types`]);
//! what a component has, from the file that declares it.

pub(crate) use crate::project::{directory, join};
use crate::project::{Key, Project, Shape, Source};

#[derive(Clone)]
pub(crate) enum Kind {
    Qt(&'static qt_types::Type),
    /// A QML file, or an inline component of one.
    Component(Key),
}

/// Where a type comes from, which is where the compiled module imports it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Origin {
    /// A named export of a Qt module, by the URI the file imports.
    Module(String),
    /// The default export of a QML file, by its path from the file.
    File(String),
    /// A function of this module.
    Inline,
    /// A member of a namespace the file imports `as` something.
    Namespace,
}

pub(crate) struct Found {
    pub kind: Kind,
    pub origin: Origin,
}

pub(crate) enum Member {
    Property(Property),
    Signal,
    Method,
}

#[derive(Clone, Copy, Default)]
pub(crate) struct Property {
    /// What is written there is a template, not an object: a `delegate`.
    pub is_component: bool,
    /// A path is taken from the file it is written in.
    pub is_url: bool,
    /// What is written there is text, also where it reads as a path.
    pub is_text: bool,
    /// What is written there is run when its time comes, and worth nothing
    /// until then: the `script` of a ScriptAction or a StateChangeScript.
    /// (What an AnchorChanges or a ParentChange is given is a script to Qt
    /// too, but one that is worth a value: a binding.)
    pub is_script: bool,
    /// A key of an enum written there is a constant: the property holds an
    /// enum or an `int`.
    pub takes_key: bool,
    /// An object written there is a list of one.
    pub is_list: bool,
    /// The type of the value, for the properties under it: `font.bold`.
    pub value: Option<&'static qt_types::Type>,
}

/// The path to import `target` by from the module of `file`, both keys.
pub(crate) fn relative(file: &str, target: &str) -> String {
    if target.starts_with('/') {
        return target.to_string();
    }
    let from: Vec<&str> = directory(file).split('/').filter(|part| !part.is_empty()).collect();
    let to: Vec<&str> = target.split('/').collect();
    let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let mut parts: Vec<&str> = vec![".."; from.len() - common];
    parts.extend(&to[common..]);
    let path = parts.join("/");
    if path.starts_with("../") { path } else { format!("./{path}") }
}

/// The types of one file.
#[derive(Clone, Copy)]
pub(crate) struct Types<'p> {
    pub project: &'p Project,
    /// The file's key in the project.
    pub file: &'p str,
}

impl<'p> Types<'p> {
    /// What the dotted name `parts` is as a type: `Item`, `C.Button`.
    pub(crate) fn find(&self, parts: &[&str]) -> Option<Found> {
        let summary = self.project.summary(self.file)?;
        let (qualifier, name) = match parts {
            [name] => (None, *name),
            [qualifier, name] => (Some(*qualifier), *name),
            _ => return None,
        };
        if qualifier.is_none() {
            let key = Key { file: self.file.to_string(), inline: Some(name.to_string()) };
            if self.project.shape(&key).is_some() {
                return Some(Found { kind: Kind::Component(key), origin: Origin::Inline });
            }
        }
        for import in summary.imports.iter().rev() {
            if import.alias.as_deref() != qualifier {
                continue;
            }
            match &import.source {
                Source::Module(uri) => {
                    // A module of the project's own. Its types are files, and
                    // a file has one name: `M.Type` is not reached yet.
                    if qualifier.is_none()
                        && let Some(file) = self.project.module_type(uri, name)
                    {
                        let file = file.to_string();
                        return Some(Found {
                            kind: Kind::Component(Key { file: file.clone(), inline: None }),
                            origin: Origin::File(file),
                        });
                    }
                    if let Some(ty) = qt_types::module(uri).and_then(|module| module.type_named(name)) {
                        let origin = match qualifier {
                            Some(_) => Origin::Namespace,
                            None => Origin::Module(uri.clone()),
                        };
                        return Some(Found { kind: Kind::Qt(ty), origin });
                    }
                }
                Source::Path(path) if !path.ends_with(".js") && !path.ends_with(".mjs") => {
                    if let Some(file) = self.file_named(&join(directory(self.file), path), name) {
                        let origin = match qualifier {
                            Some(_) => Origin::Namespace,
                            None => Origin::File(file.clone()),
                        };
                        return Some(Found { kind: Kind::Component(Key { file, inline: None }), origin });
                    }
                }
                Source::Path(_) => {}
            }
        }
        if qualifier.is_none() {
            // The file's own directory is imported before anything else, so
            // everything else comes first.
            if let Some(file) = self.file_named(directory(self.file), name) {
                return Some(Found {
                    kind: Kind::Component(Key { file: file.clone(), inline: None }),
                    origin: Origin::File(file),
                });
            }
            // So is the module the file is a type of, wherever its files are.
            for uri in self.project.modules_of(self.file) {
                if let Some(file) = self.project.module_type(uri, name) {
                    let file = file.to_string();
                    return Some(Found {
                        kind: Kind::Component(Key { file: file.clone(), inline: None }),
                        origin: Origin::File(file),
                    });
                }
            }
            // A module of Qt's that is written in QML has types that are not:
            // a style of Qt Quick Controls names `Overlay` and imports nothing
            // for it.
            for uri in self.project.modules_of(self.file) {
                if let Some(ty) = qt_types::module(uri).and_then(|module| module.type_named(name)) {
                    return Some(Found { kind: Kind::Qt(ty), origin: Origin::Module(uri.clone()) });
                }
            }
        }
        None
    }

    /// The file in `directory` that is the type `name`: `Name.qml`, or the
    /// `Name.ui.qml` Qt Design Studio writes.
    fn file_named(&self, directory: &str, name: &str) -> Option<String> {
        let file = join(directory, name);
        if self.project.summary(&file).is_some() {
            return Some(file);
        }
        let file = format!("{file}.ui");
        self.project.summary(&file).is_some().then_some(file)
    }

    /// `pragma Singleton`: the type is one object, there before it is named.
    pub(crate) fn is_singleton(&self, kind: &Kind) -> bool {
        match kind {
            Kind::Component(Key { file, inline: None }) => {
                self.project.summary(file).is_some_and(|summary| summary.is_singleton)
            }
            _ => false,
        }
    }

    /// What `member` is to the enums a component declares: `Some(true)` an
    /// enum (`Type.Theme`, of `Type.Theme.Dark`), `Some(false)` a key. The
    /// enums of the component its root is are its own too.
    pub(crate) fn declared_enum(&self, kind: &Kind, member: &str) -> Option<bool> {
        let mut kind = kind.clone();
        for _ in 0..64 {
            let Kind::Component(key) = kind else { return None };
            let shape = self.project.shape(&key)?;
            if shape.enums.values().any(|keys| keys.iter().any(|key| key == member)) {
                return Some(false);
            }
            if shape.enums.contains_key(member) {
                return Some(true);
            }
            kind = self.root(&key, shape)?;
        }
        None
    }

    /// Whether `Type.key`, or `Type.scope.key`, is a key of an enum of the
    /// type: one a component in its chain declares, or one of the Qt type
    /// the chain ends in.
    pub(crate) fn is_key(&self, kind: &Kind, scope: Option<&str>, key: &str) -> bool {
        let mut kind = kind.clone();
        for _ in 0..64 {
            let file = match kind {
                Kind::Qt(ty) => {
                    return ty.enum_value(key).is_some_and(|value| {
                        let enumeration = value.enumeration;
                        scope.is_none_or(|scope| scope == enumeration.name || Some(scope) == enumeration.alias)
                    });
                }
                Kind::Component(file) => file,
            };
            let Some(shape) = self.project.shape(&file) else { return false };
            if shape.enums.iter().any(|(name, keys)| {
                scope.is_none_or(|scope| scope == name) && keys.iter().any(|known| known == key)
            }) {
                return true;
            }
            let Some(root) = self.root(&file, shape) else { return false };
            kind = root;
        }
        false
    }

    /// Whether `name` is what the file imports something `as`.
    pub(crate) fn namespace(&self, name: &str) -> Option<&'p Source> {
        let summary = self.project.summary(self.file)?;
        summary.imports.iter().rev().find(|import| import.alias.as_deref() == Some(name)).map(|import| &import.source)
    }

    /// The Qt type a component's objects are, however many components down.
    pub(crate) fn base(&self, kind: &Kind) -> Option<&'static qt_types::Type> {
        let mut kind = kind.clone();
        for _ in 0..64 {
            match kind {
                Kind::Qt(ty) => return Some(ty),
                Kind::Component(key) => {
                    let shape = self.project.shape(&key)?;
                    kind = self.root(&key, shape)?;
                }
            }
        }
        None
    }

    fn root(&self, key: &Key, shape: &Shape) -> Option<Kind> {
        let parts: Vec<&str> = shape.root.iter().map(String::as_str).collect();
        let types = Types { project: self.project, file: &key.file };
        types.find(&parts).map(|found| found.kind)
    }

    /// What `name` is on an object of the type: something a component in its
    /// chain declares, or a member of the Qt type the chain ends in.
    pub(crate) fn member(&self, kind: &Kind, name: &str) -> Option<Member> {
        self.member_through(kind, name, 0)
    }

    /// `aliases` is how many aliases led here: one may be of another, and
    /// what is written wrong may be of itself.
    fn member_through(&self, kind: &Kind, name: &str, aliases: usize) -> Option<Member> {
        let mut kind = kind.clone();
        // A component whose root is itself, by whatever detour, has no root.
        for _ in 0..64 {
            match kind {
                Kind::Qt(ty) => return qt_member(ty, name),
                Kind::Component(key) => {
                    let shape = self.project.shape(&key)?;
                    if let Some(member) = shape_member(shape, name) {
                        // An alias is the property it is an alias of: a path
                        // given to `property alias source: image.source` is
                        // a path (`home` says which file it is taken from).
                        let aliased = shape.properties.get(name).and_then(|declaration| {
                            let (of, path) = declaration.alias.as_ref()?;
                            let (first, rest) = path.split_first()?;
                            if aliases == 16 {
                                return None;
                            }
                            let types = Types { project: self.project, file: &key.file };
                            let parts: Vec<&str> = of.iter().map(String::as_str).collect();
                            let Member::Property(mut property) =
                                types.member_through(&types.find(&parts)?.kind, first, aliases + 1)?
                            else {
                                return None;
                            };
                            for name in rest {
                                property = qt_property(property.value?.property(name)?);
                            }
                            Some(Member::Property(property))
                        });
                        return Some(aliased.unwrap_or(member));
                    }
                    kind = self.root(&key, shape)?;
                }
            }
        }
        None
    }

    /// The file a path given to the property `name` of an object of the type
    /// is taken from, where that is not the file the object is written in:
    /// the one a component declares the property in, which is where it uses
    /// it, and for an alias the one that has the object it is an alias of.
    /// Qt keeps the path as it is written, and what loads it takes it from
    /// the file it is itself written in. A type of Qt's, in C++, takes it from
    /// the file that makes the object, and so does what stands in for one.
    pub(crate) fn home(&self, kind: &Kind, name: &str) -> Option<String> {
        self.home_through(kind, name, 0)
    }

    fn home_through(&self, kind: &Kind, name: &str, aliases: usize) -> Option<String> {
        let mut kind = kind.clone();
        for _ in 0..64 {
            let Kind::Component(key) = kind else { return None };
            let shape = self.project.shape(&key)?;
            if let Some(declaration) = shape.properties.get(name) {
                let Some((of, path)) = &declaration.alias else {
                    return (!self.project.stands_in(&key.file)).then_some(key.file);
                };
                let first = path.first()?;
                if aliases == 16 {
                    return None;
                }
                let types = Types { project: self.project, file: &key.file };
                let parts: Vec<&str> = of.iter().map(String::as_str).collect();
                let target = types.find(&parts)?.kind;
                return types.home_through(&target, first, aliases + 1).or(Some(key.file));
            }
            kind = self.root(&key, shape)?;
        }
        None
    }

    /// The names a handler of the signal `name` may call its arguments. A
    /// type may have a property of the same name: `pressed` of a MouseArea.
    pub(crate) fn signal(&self, kind: &Kind, name: &str) -> Option<Vec<String>> {
        let mut kind = kind.clone();
        for _ in 0..64 {
            match kind {
                Kind::Qt(ty) => {
                    let signal = ty.signal(name)?;
                    return Some(signal.parameters.iter().map(|name| (*name).to_string()).collect());
                }
                Kind::Component(key) => {
                    let shape = self.project.shape(&key)?;
                    if let Some(parameters) = shape.signals.get(name) {
                        return Some(parameters.clone());
                    }
                    kind = self.root(&key, shape)?;
                }
            }
        }
        None
    }

    /// The property whose value the signal `name` carries to its handlers,
    /// when it is one of a Qt type's: [`carried`]. What a component declares
    /// by that name is its own, and carries what it says.
    pub(crate) fn carried<'n>(&self, kind: &Kind, name: &'n str) -> Option<&'n str> {
        let property = name.strip_suffix("Changed")?;
        let mut kind = kind.clone();
        for _ in 0..64 {
            match kind {
                Kind::Qt(ty) => return carried(ty, name),
                Kind::Component(key) => {
                    let shape = self.project.shape(&key)?;
                    if shape.signals.contains_key(name) || shape.properties.contains_key(property) {
                        return None;
                    }
                    kind = self.root(&key, shape)?;
                }
            }
        }
        None
    }

    /// The properties whoever makes an object of the type has to set: what
    /// the components in its chain require, and what the Qt type the chain
    /// ends in does, in its C++ (`tableView` of a TableViewDelegate) or in
    /// the QML of a style (`row`, `column` and `model` of Basic's).
    pub(crate) fn required(&self, kind: &Kind) -> Vec<String> {
        let mut required: Vec<String> = Vec::new();
        let mut kind = kind.clone();
        for _ in 0..64 {
            match kind {
                Kind::Qt(ty) => {
                    let mut ty = Some(ty);
                    while let Some(found) = ty {
                        for property in found.properties.iter().filter(|property| property.is_required) {
                            if !required.iter().any(|name| name == property.name) {
                                required.push(property.name.to_string());
                            }
                        }
                        ty = found.prototype();
                    }
                    break;
                }
                Kind::Component(key) => {
                    let Some(shape) = self.project.shape(&key) else { break };
                    for name in &shape.required {
                        if !required.contains(name) {
                            required.push(name.clone());
                        }
                    }
                    let Some(root) = self.root(&key, shape) else { break };
                    kind = root;
                }
            }
        }
        required
    }

    /// The property objects written inside one of the type go to, when it is
    /// a template: a Repeater's `delegate`.
    pub(crate) fn default_component(&self, kind: &Kind) -> Option<&'static str> {
        let mut kind = kind.clone();
        for _ in 0..64 {
            match kind {
                Kind::Qt(ty) => {
                    let name = ty.default_property()?;
                    return ty.property(name).is_some_and(|property| property.is_component).then_some(name);
                }
                Kind::Component(key) => {
                    let shape = self.project.shape(&key)?;
                    if shape.has_default {
                        return None;
                    }
                    kind = self.root(&key, shape)?;
                }
            }
        }
        None
    }
}

pub(crate) fn qt_property(property: &'static qt_types::Property) -> Property {
    Property {
        is_component: property.is_component,
        is_url: property.type_name == "QUrl" && !property.is_list,
        is_text: property.type_name == "QString" && !property.is_list,
        is_script: property.type_name == "QQmlScriptString" && property.name == "script",
        // An int, or a property declared with an enum: it takes a key
        // (`Text.AlignLeft`), which is the key's name at run time.
        takes_key: !property.is_list
            && (property.type_name == "int"
                || qt_types::is_enum_name(property.type_name.rsplit("::").next().unwrap_or(property.type_name))),
        is_list: property.is_list,
        value: property.value_type(),
    }
}

pub(crate) fn qt_member(ty: &'static qt_types::Type, name: &str) -> Option<Member> {
    if let Some(property) = ty.property(name) {
        return Some(Member::Property(qt_property(property)));
    }
    if ty.signal(name).is_some() {
        return Some(Member::Signal);
    }
    ty.has_method(name).then_some(Member::Method)
}

/// A declared property, by the type it was declared with.
pub(crate) fn declared_property(type_name: &str, is_list: bool) -> Property {
    Property {
        is_component: type_name == "Component" && !is_list,
        is_url: type_name == "url" && !is_list,
        is_text: type_name == "string" && !is_list,
        is_script: false,
        takes_key: type_name == "int" && !is_list,
        is_list,
        value: None,
    }
}

fn shape_member(shape: &Shape, name: &str) -> Option<Member> {
    if let Some(declaration) = shape.properties.get(name) {
        return Some(Member::Property(declared_property(&declaration.type_name, declaration.is_list)));
    }
    if shape.signals.contains_key(name) {
        return Some(Member::Signal);
    }
    if shape.functions.contains(name) {
        return Some(Member::Method);
    }
    // A property comes with the signal that says it changed.
    let property = name.strip_suffix("Changed")?;
    shape.properties.contains_key(property).then_some(Member::Signal)
}

/// `onClicked` → `clicked`: the signal a handler's name stands for.
/// The property whose new value Qt's signal `name` carries: `text`, of the
/// `textChanged(text)` of a Text. Qt says it signal by signal, and most carry
/// nothing: `widthChanged()`, and the change of any property QML declares.
pub(crate) fn carried<'n>(ty: &'static qt_types::Type, name: &'n str) -> Option<&'n str> {
    let property = name.strip_suffix("Changed")?;
    let [parameter] = ty.signal(name)?.parameters.as_slice() else { return None };
    // Not the value, by the name Qt gives it: by how much a handler moved
    // (`scaleChanged(delta)`), the event (`mouseXChanged(mouse)`).
    if matches!(*parameter, "delta" | "mouse") {
        return None;
    }
    ty.property(property).map(|_| property)
}

pub(crate) fn handled(name: &str) -> Option<String> {
    let rest = name.strip_prefix("on")?;
    let first = rest.chars().next()?;
    (first.is_ascii_uppercase() || first == '_').then(|| {
        let mut signal = first.to_ascii_lowercase().to_string();
        signal.push_str(&rest[first.len_utf8()..]);
        signal
    })
}
