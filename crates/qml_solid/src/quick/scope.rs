//! The objects of a file: what each is, what it declares, and whose names an
//! expression written in it may use.
//!
//! QML resolves a name at run time by walking contexts: the object the
//! expression belongs to, the root of its component, then the components
//! around it. Everything that walk needs is in the file and in the types it
//! names, so it is read off here and the walk is done when the file is
//! compiled.

use std::collections::{HashMap, HashSet};

use qml_syntax::ast::*;
use oxc_span::Span;

use super::types::{self, Kind, Member, Origin, Property, Types};
use crate::Error;

pub(crate) struct Tree<'a> {
    pub objects: Vec<Object<'a>>,
    pub contexts: Vec<Context>,
    /// Every id of the file, whichever component it is in.
    ids: HashSet<&'a str>,
    by_start: HashMap<u32, usize>,
    /// What a PropertyChanges or an AnchorChanges changes, and the object it
    /// is written in: Qt evaluates it as a binding of the target's.
    changes: Vec<(Span, usize)>,
    /// The id each of them, or a Connections, names as its `target`.
    targets: HashMap<usize, &'a str>,
    /// The PropertyChanges among them: what one changes is given its target.
    given: HashSet<usize>,
}

pub(crate) struct Object<'a> {
    pub span: Span,
    /// The type as it is written: `Item`, `C.Button`.
    pub name: String,
    /// None when the type is not one the file knows, which was reported.
    pub kind: Option<Kind>,
    pub origin: Option<Origin>,
    /// The JavaScript binding that holds the object: its `id`, or a name no
    /// QML name can be.
    pub handle: String,
    pub declared: HashMap<&'a str, Declared>,
    pub context: usize,
    /// A `Component { }`: what is in it is a template, and its id names that.
    pub is_template: bool,
}

/// The properties of `PropertyChanges` itself; any other name is a property
/// of its target.
pub(crate) const CHANGES: &[&str] = &["target", "explicit", "restoreEntryValues"];

pub(crate) enum Declared {
    Property(Property),
    Signal(Vec<String>),
    Function,
}

/// One component's worth of objects: what QML makes a context for.
pub(crate) struct Context {
    pub root: usize,
    /// The context the component is written in. An inline `component` has
    /// none: it sees nothing of the file around it.
    pub outer: Option<usize>,
    /// The binding that holds what a delegate is given: `index`, the roles.
    pub data: Option<String>,
}

impl<'a> Tree<'a> {
    pub(crate) fn analyze(document: &QmlDocument<'a>, types: Types<'_>, errors: &mut Vec<Error>) -> Self {
        let mut analysis = Analysis {
            tree: Tree {
                objects: Vec::new(),
                contexts: Vec::new(),
                ids: HashSet::new(),
                by_start: HashMap::new(),
                changes: Vec::new(),
                targets: HashMap::new(),
                given: HashSet::new(),
            },
            types,
            errors,
            handles: 0,
        };
        analysis.component(&document.root, None, false);
        analysis.tree
    }

    pub(crate) fn index_of(&self, object: &QmlObject<'a>) -> usize {
        self.by_start[&object.span.start]
    }

    /// The innermost object `offset` is written in.
    pub(crate) fn object_at(&self, offset: u32) -> usize {
        // Objects are in source order, so the last one that starts before the
        // offset and has not ended is the innermost.
        self.objects
            .iter()
            .enumerate()
            .rev()
            .find(|(_, object)| object.span.start <= offset && offset < object.span.end)
            .map_or(0, |(index, _)| index)
    }

    /// The object whose names an expression at `offset` may use as its own:
    /// the one it is written in, or for what a state changes, the target
    /// (`anchors.bottom: parent.bottom` is the bottom of the target's parent).
    /// A target that is not named by its id is known only to the running
    /// program: see [`Tree::aimed`].
    pub(crate) fn scope_at(&self, offset: u32) -> usize {
        let written = self.object_at(offset);
        if !self.changed(written, offset) {
            return written;
        }
        self.target(written).unwrap_or(written)
    }

    fn changed(&self, written: usize, offset: u32) -> bool {
        self.changes.iter().any(|(span, owner)| *owner == written && span.start <= offset && offset < span.end)
    }

    /// Whether `offset` is in what a PropertyChanges changes of a target it
    /// does not name by its id (`target: view.currentItem`). Qt evaluates it
    /// as a binding of the target's all the same, so a name is the target's
    /// if the target has it, which only the running program can tell.
    pub(crate) fn aimed(&self, offset: u32) -> bool {
        let written = self.object_at(offset);
        self.given.contains(&written) && self.changed(written, offset) && self.target(written).is_none()
    }

    /// The object a PropertyChanges or a Connections names as its `target`,
    /// when it names it by its id.
    pub(crate) fn target(&self, owner: usize) -> Option<usize> {
        let id = self.targets.get(&owner)?;
        let mut context = Some(self.objects[owner].context);
        while let Some(at) = context {
            if let Some(target) = self.objects.iter().position(|object| object.context == at && object.handle == *id) {
                return Some(target);
            }
            context = self.contexts[at].outer;
        }
        None
    }

    /// The name of the binding that holds the context of the component the
    /// object is in: the file's, or an inline one's.
    pub(crate) fn scope_of(&self, index: usize) -> String {
        let mut context = self.objects[index].context;
        while let Some(outer) = self.contexts[context].outer {
            context = outer;
        }
        if context == 0 { "$scope".to_string() } else { format!("$scope{context}") }
    }

    /// The ids of the component whose root is `root` that its scripts reach
    /// as JavaScript bindings of its function: not the ones in a delegate.
    pub(crate) fn ids_of(&self, root: usize) -> Vec<&str> {
        let context = self.objects[root].context;
        self.objects
            .iter()
            .filter(|object| object.context == context && self.ids.contains(object.handle.as_str()))
            .map(|object| object.handle.as_str())
            .collect()
    }

    pub(crate) fn is_id(&self, name: &str) -> bool {
        self.ids.contains(name)
    }

    /// Whether the object is what a template makes: the root of a component
    /// written in the file, not an object of the one around it.
    pub(crate) fn is_root(&self, index: usize) -> bool {
        self.contexts[self.objects[index].context].root == index
    }

    /// What `name` is on the object: something it declares, or a member of
    /// its type.
    pub(crate) fn member(&self, types: Types<'_>, index: usize, name: &str) -> Option<Member> {
        let object = &self.objects[index];
        match object.declared.get(name) {
            Some(Declared::Property(property)) => return Some(Member::Property(*property)),
            Some(Declared::Signal(_)) => return Some(Member::Signal),
            Some(Declared::Function) => return Some(Member::Method),
            None => {}
        }
        if let Some(property) = name.strip_suffix("Changed")
            && matches!(object.declared.get(property), Some(Declared::Property(_)))
        {
            return Some(Member::Signal);
        }
        types.member(object.kind.as_ref()?, name)
    }

    /// The file a path given to the object's property `name` is taken from,
    /// where that is not the one the object is written in.
    pub(crate) fn home(&self, types: Types<'_>, index: usize, name: &str) -> Option<String> {
        let object = &self.objects[index];
        if object.declared.contains_key(name) {
            return None;
        }
        types.home(object.kind.as_ref()?, name)
    }

    /// The names a handler of the object's signal `name` may call its
    /// arguments; None if it has no such signal.
    pub(crate) fn signal(&self, types: Types<'_>, index: usize, name: &str) -> Option<Vec<String>> {
        let object = &self.objects[index];
        match object.declared.get(name) {
            Some(Declared::Signal(parameters)) => return Some(parameters.clone()),
            Some(_) => return None,
            None => {}
        }
        if let Some(property) = name.strip_suffix("Changed")
            && matches!(object.declared.get(property), Some(Declared::Property(_)))
        {
            return Some(Vec::new());
        }
        types.signal(object.kind.as_ref()?, name)
    }

    /// The property whose value the object's signal `name` carries to its
    /// handlers: [`types::carried`].
    pub(crate) fn carried<'n>(&self, types: Types<'_>, index: usize, name: &'n str) -> Option<&'n str> {
        let object = &self.objects[index];
        let property = name.strip_suffix("Changed")?;
        if object.declared.contains_key(name) || object.declared.contains_key(property) {
            return None;
        }
        types.carried(object.kind.as_ref()?, name)
    }

    /// What the property a binding names is, through the groups on the way:
    /// `border.width` is the `width` of what `border` is.
    pub(crate) fn property(&self, types: Types<'_>, index: usize, path: &[&str]) -> Option<Property> {
        let (first, rest) = path.split_first()?;
        let Member::Property(mut property) = self.member(types, index, first)? else { return None };
        for name in rest {
            property = types::qt_property(property.value?.property(name)?);
        }
        Some(property)
    }
}

struct Analysis<'a, 'p, 'e> {
    tree: Tree<'a>,
    types: Types<'p>,
    errors: &'e mut Vec<Error>,
    handles: usize,
}

impl<'a> Analysis<'a, '_, '_> {
    /// The root of a component, in a context of its own.
    fn component(&mut self, root: &QmlObject<'a>, outer: Option<usize>, is_template: bool) -> usize {
        let context = self.tree.contexts.len();
        // A delegate inside a delegate is given its own, and still sees what
        // the one around it is given.
        let mut depth = 0;
        let mut around = outer;
        while let Some(index) = around {
            depth += usize::from(self.tree.contexts[index].data.is_some());
            around = self.tree.contexts[index].outer;
        }
        let data = is_template.then(|| if depth == 0 { "$data".to_string() } else { format!("$data{depth}") });
        self.tree.contexts.push(Context { root: self.tree.objects.len(), outer, data });
        self.object(root, context)
    }

    fn object(&mut self, object: &QmlObject<'a>, context: usize) -> usize {
        let parts: Vec<&str> = object.type_name.parts.iter().copied().collect();
        let found = self.types.find(&parts);
        if found.is_none() {
            self.errors.push(Error::new(
                format!("`{}` is not a type of anything the file imports", object.type_name),
                object.type_name.span,
            ));
        }
        let (kind, origin) = found.map_or((None, None), |found| (Some(found.kind), Some(found.origin)));
        let is_template = matches!(&kind, Some(Kind::Qt(ty)) if ty.class == "QQmlComponent");
        let handle = match id(object) {
            Some(id) => {
                self.tree.ids.insert(id);
                id.to_string()
            }
            None => {
                self.handles += 1;
                format!("${}", self.handles)
            }
        };
        let index = self.tree.objects.len();
        self.tree.by_start.insert(object.span.start, index);
        self.tree.objects.push(Object {
            span: object.span,
            name: object.type_name.to_string(),
            kind,
            origin,
            handle,
            declared: HashMap::new(),
            context,
            is_template,
        });
        self.declarations(object, index);
        self.members(object, index, context, &[]);
        index
    }

    fn declarations(&mut self, object: &QmlObject<'a>, index: usize) {
        let mut declared = HashMap::new();
        for member in &object.members {
            match member {
                QmlMember::Property(property) => {
                    let Some(type_name) = &property.type_name else { continue };
                    declared.insert(
                        property.name.name.as_str(),
                        Declared::Property(types::declared_property(
                            &type_name.name.to_string(),
                            type_name.is_list,
                        )),
                    );
                }
                QmlMember::Signal(signal) => {
                    declared.insert(
                        signal.name.name.as_str(),
                        Declared::Signal(signal.params.iter().map(|param| param.name.name.to_string()).collect()),
                    );
                }
                QmlMember::Function(function) => {
                    if let Some(id) = &function.id {
                        declared.insert(id.name.as_str(), Declared::Function);
                    }
                }
                _ => {}
            }
        }
        self.tree.objects[index].declared = declared;
    }

    /// The objects written in `object`, which is `owner` or a group of it
    /// (`font { }`), `group` being the names that lead there.
    fn members(&mut self, object: &QmlObject<'a>, owner: usize, context: usize, group: &[&'a str]) {
        let is_template = self.tree.objects[owner].is_template;
        let default_component = self.tree.objects[owner]
            .kind
            .as_ref()
            .and_then(|kind| self.types.default_component(kind))
            .is_some();
        for member in &object.members {
            match member {
                QmlMember::Object(child) if is_group(child) => {
                    let mut path = group.to_vec();
                    path.extend(child.type_name.parts.iter().copied());
                    self.members(child, owner, context, &path);
                }
                QmlMember::Object(child) => {
                    let template = child.on.is_none() && (is_template || default_component);
                    self.value(child, context, template);
                }
                QmlMember::Binding(binding) => {
                    let mut path = group.to_vec();
                    path.extend(binding.name.parts.iter().copied());
                    self.change(binding, owner, &path);
                    let template = self
                        .tree
                        .property(self.types, owner, &path)
                        .or_else(|| self.attached(&path))
                        .is_some_and(|property| property.is_component);
                    self.values(&binding.value, context, template);
                }
                QmlMember::Property(QmlPropertyDeclaration { value: Some(value), type_name, .. }) => {
                    let template = type_name
                        .as_ref()
                        .is_some_and(|type_name| type_name.name.as_simple() == Some("Component") && !type_name.is_list);
                    self.values(value, context, template);
                }
                QmlMember::InlineComponent(inline) => {
                    self.component(&inline.object, None, false);
                }
                _ => {}
            }
        }
    }

    /// A binding written in a PropertyChanges or an AnchorChanges: its
    /// target, or something of the target's to change.
    fn change(&mut self, binding: &QmlBinding<'a>, owner: usize, path: &[&'a str]) {
        let class = self.tree.objects[owner].kind.as_ref().and_then(|kind| self.types.base(kind)).map(|ty| ty.class);
        let changes = match class {
            Some("QQuickPropertyChanges") => {
                // `rect.width: 10` is a binding like any other.
                !CHANGES.contains(&path[0]) && !(path.len() > 1 && self.tree.ids.contains(path[0]))
            }
            Some("QQuickAnchorChanges") => path[0] == "anchors",
            // Its handlers are of its target's signals.
            Some("QQmlConnections") => false,
            _ => return,
        };
        if changes {
            self.tree.changes.push((binding.span, owner));
            if class == Some("QQuickPropertyChanges") {
                self.tree.given.insert(owner);
            }
        } else if let (["target"], QmlBindingValue::Expression(oxc_ast::ast::Expression::Identifier(id))) =
            (path, &binding.value)
        {
            self.tree.targets.insert(owner, id.name.as_str());
        }
    }

    /// What `TableView.editDelegate` is: a property of what a type attaches.
    fn attached(&self, path: &[&str]) -> Option<Property> {
        let (name, of) = path.split_last()?;
        let attaching = self.types.base(&self.types.find(of)?.kind)?.attached()?;
        Some(types::qt_property(attaching.property(name)?))
    }

    fn values(&mut self, value: &QmlBindingValue<'a>, context: usize, template: bool) {
        match value {
            QmlBindingValue::Object(object) => {
                self.value(object, context, template);
            }
            QmlBindingValue::Objects(objects) => {
                for object in objects {
                    self.value(object, context, template);
                }
            }
            _ => {}
        }
    }

    /// An object where a value goes. Where a template goes it is the root of
    /// a component, unless it is a `Component` itself: then what is in it is.
    fn value(&mut self, object: &QmlObject<'a>, context: usize, template: bool) {
        let is_component = self
            .types
            .find(&object.type_name.parts.iter().copied().collect::<Vec<_>>())
            .is_some_and(|found| matches!(found.kind, Kind::Qt(ty) if ty.class == "QQmlComponent"));
        if template && !is_component {
            self.component(object, Some(context), true);
        } else {
            self.object(object, context);
        }
    }
}

/// The `id` an object gives itself.
pub(crate) fn id<'a>(object: &QmlObject<'a>) -> Option<&'a str> {
    object.members.iter().find_map(|member| match member {
        QmlMember::Binding(QmlBinding {
            name,
            value: QmlBindingValue::Expression(oxc_ast::ast::Expression::Identifier(id)),
            ..
        }) if name.as_simple() == Some("id") => Some(id.name.as_str()),
        _ => None,
    })
}

/// `font { ... }`: an object whose "type" is a lowercase property name.
pub(crate) fn is_group(object: &QmlObject<'_>) -> bool {
    object.on.is_none() && object.type_name.parts[0].starts_with(|c: char| c.is_ascii_lowercase())
}
