//! The static shape of a QML file: its objects, ids and declared members.
//!
//! QML resolves names against a runtime context chain. Everything in that chain
//! is known when the file is compiled, so it is resolved here once and the
//! output contains plain JavaScript bindings instead of scope lookups.

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::*;
use oxc_ast_visit::{Visit, walk};
use qml_syntax::ast::*;
use oxc_span::Span;

use crate::Error;

/// A declared member and the JavaScript binding that carries it.
#[derive(Debug, Clone)]
pub(crate) enum Member {
    /// A constant: read as `name`, which Solid treats as static.
    Const(String),
    /// A derivation cheap enough to re-read: `const name = () => value`.
    Getter(String),
    /// `const name = createMemo(() => value)`.
    Memo(String),
    /// A property something assigns to: `const [get, set] = createSignal(...)`.
    Signal { get: String, set: String },
    /// A function, or a signal: the function that emits it.
    Function(String),
    Unsupported(&'static str),
}

impl Member {
    fn is_property(&self) -> bool {
        !matches!(self, Member::Function(_) | Member::Unsupported(_))
    }
}

/// A name the enclosing delegate provides (`modelData`, `index`).
#[derive(Debug, Clone, Copy)]
pub(crate) struct Provided {
    pub js: &'static str,
    pub accessor: bool,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct Delegate {
    pub model_data: Provided,
    pub index: Provided,
    /// A count model: the delegate is repeated, there are no items.
    pub count: bool,
}

impl Delegate {
    /// `<For>`: the item itself and an index accessor.
    const EACH: Delegate = Delegate {
        model_data: Provided { js: "$modelData", accessor: false },
        index: Provided { js: "$index", accessor: true },
        count: false,
    };
    /// `<Repeat>`: a plain index, which is also the model data.
    const COUNT: Delegate = Delegate {
        model_data: Provided { js: "$index", accessor: false },
        index: Provided { js: "$index", accessor: false },
        count: true,
    };
}

#[derive(Debug)]
pub(crate) struct Object<'a> {
    pub span: Span,
    pub type_name: &'a str,
    pub members: HashMap<&'a str, Member>,
    /// The parameter names of the signals declared here.
    pub signals: HashMap<&'a str, Vec<&'a str>>,
    /// Set on the root object of a delegate.
    pub delegate: Option<Delegate>,
    /// The root of the component this object belongs to: the root of the file
    /// or inline component, or the nearest delegate root (possibly the object
    /// itself).
    pub component_root: usize,
    /// The component root of the scope the component was created in.
    pub outer: Option<usize>,
    /// The root of the file or inline component the object is written in.
    /// Ids are unique within it and invisible outside it.
    pub document: usize,
}

impl Object<'_> {
    /// What `name` handles, if it is a handler of something declared here.
    pub(crate) fn own(&self, name: &str) -> Option<Own> {
        classify(
            name,
            |signal| self.signals.contains_key(signal),
            |property| self.members.get(property).is_some_and(Member::is_property),
        )
    }
}

pub(crate) use qml_front::scope::{Own, classify, is_literal, object_id, walk_leaves};

/// `property alias name: id.property`, when the target is a built-in property:
/// the alias is the binding and the target reads it.
#[derive(Debug)]
pub(crate) struct Alias<'a> {
    pub name: &'a str,
    pub member: Member,
}

#[derive(Debug, Default)]
pub(crate) struct Scopes<'a> {
    pub objects: Vec<Object<'a>>,
    ids: HashMap<(usize, &'a str), usize>,
    by_start: HashMap<u32, usize>,
    /// Aliases of built-in properties, by target object and property.
    pub aliases: HashMap<(usize, String), Alias<'a>>,
    /// Declared properties a root alias stands for, and that alias's name.
    pub aliased: HashMap<(usize, &'a str), &'a str>,
    /// Where the children given to a component go when its default property
    /// is an alias, by component root.
    pub children: HashMap<usize, usize>,
}

impl<'a> Scopes<'a> {
    pub(crate) fn analyze(document: &QmlDocument<'a>, errors: &mut Vec<Error>) -> Self {
        let mut assigned = Assigned::default();
        walk_leaves(&document.root, &mut assigned);

        let mut analysis = Analysis {
            scopes: Scopes::default(),
            assigned,
            taken: HashSet::new(),
            document: 0,
            pending: Vec::new(),
            errors,
        };
        collect_ids(&document.root, &mut analysis.taken);
        analysis.object(&document.root, None, None);
        analysis.scopes
    }

    pub(crate) fn index_of(&self, object: &QmlObject<'a>) -> usize {
        self.by_start[&object.span.start]
    }

    /// The innermost object whose source text contains `offset`.
    pub(crate) fn object_at(&self, offset: u32) -> usize {
        // Objects are stored in document order, so the last one that contains
        // the offset is the innermost.
        self.objects
            .iter()
            .rposition(|object| object.span.start <= offset && offset < object.span.end)
            .unwrap_or(0)
    }

    pub(crate) fn member(&self, object: usize, name: &str) -> Option<&Member> {
        self.objects[object].members.get(name)
    }

    /// The object `id` names, as seen from `object`.
    pub(crate) fn id(&self, object: usize, id: &str) -> Option<usize> {
        self.ids.get(&(self.objects[object].document, id)).copied()
    }

    /// Whether the object is the root of a file or of an inline component:
    /// what it declares is the component's interface.
    pub(crate) fn is_interface(&self, object: usize) -> bool {
        self.objects[object].document == object
    }
}

/// An alias whose target is known once the ids of its component are.
struct Pending<'a> {
    owner: usize,
    name: &'a str,
    span: Span,
    id: &'a str,
    property: String,
    is_default: bool,
    js: String,
    assigned: bool,
}

struct Analysis<'a, 'e> {
    scopes: Scopes<'a>,
    assigned: Assigned<'a>,
    /// Prefixes already used for generated binding names.
    taken: HashSet<String>,
    /// The root of the file or inline component being walked.
    document: usize,
    pending: Vec<Pending<'a>>,
    errors: &'e mut Vec<Error>,
}

impl<'a> Analysis<'a, '_> {
    /// `component` is the root of the component the object is in, or `None`
    /// when the object is the root of a file or of an inline component.
    fn object(
        &mut self,
        object: &QmlObject<'a>,
        component: Option<usize>,
        delegate: Option<Delegate>,
    ) {
        let index = self.scopes.objects.len();
        let is_interface = component.is_none();
        let enclosing = self.document;
        if is_interface {
            self.document = index;
        }
        let is_component_root = is_interface || delegate.is_some();
        let id = object_id(object);
        if let Some(id) = id {
            if self.scopes.ids.insert((self.document, id), index).is_some() {
                self.errors.push(Error::new(format!("id `{id}` is not unique"), object.span));
            }
        }
        self.scopes.by_start.insert(object.span.start, index);
        self.scopes.objects.push(Object {
            span: object.span,
            type_name: object.type_name.last(),
            members: HashMap::new(),
            signals: HashMap::new(),
            delegate,
            component_root: if is_component_root { index } else { component.unwrap_or(index) },
            outer: if is_component_root { component } else { None },
            document: self.document,
        });

        let prefix = self.prefix(object, id, is_interface);
        let mut members = HashMap::new();
        let mut signals = HashMap::new();
        for member in &object.members {
            match member {
                QmlMember::Property(property) => {
                    let kind = self.property(property, index, id, &prefix, is_interface);
                    members.insert(property.name.name.as_str(), kind);
                }
                QmlMember::Function(function) => {
                    if let Some(name) = &function.id {
                        members.insert(
                            name.name.as_str(),
                            Member::Function(format!("{prefix}${}", name.name)),
                        );
                    }
                }
                QmlMember::Signal(signal) => {
                    let name = signal.name.name.as_str();
                    members.insert(name, Member::Function(format!("{prefix}${name}")));
                    signals.insert(
                        name,
                        signal.params.iter().map(|param| param.name.name.as_str()).collect(),
                    );
                }
                _ => {}
            }
        }
        self.scopes.objects[index].members = members;
        self.scopes.objects[index].signals = signals;

        let component = self.scopes.objects[index].component_root;
        let is_repeater = object.type_name.as_simple() == Some("Repeater");
        let child_delegate = is_repeater.then(|| repeater_delegate(object));
        for member in &object.members {
            match member {
                QmlMember::Object(child) => self.object(child, Some(component), child_delegate),
                QmlMember::Binding(binding) => {
                    let delegate = if binding.name.as_simple() == Some("delegate") {
                        child_delegate
                    } else {
                        None
                    };
                    self.value(&binding.value, component, delegate);
                }
                QmlMember::Property(property) => {
                    if let Some(value) = &property.value {
                        self.value(value, component, None);
                    }
                }
                // A component of its own: nothing around it is in its scope.
                QmlMember::InlineComponent(inline) => self.object(&inline.object, None, None),
                _ => {}
            }
        }

        if is_interface {
            self.aliases(index);
            self.document = enclosing;
        }
    }

    fn value(&mut self, value: &QmlBindingValue<'a>, component: usize, delegate: Option<Delegate>) {
        match value {
            QmlBindingValue::Object(object) => self.object(object, Some(component), delegate),
            QmlBindingValue::Objects(objects) => {
                for object in objects {
                    self.object(object, Some(component), delegate);
                }
            }
            _ => {}
        }
    }

    /// The stem generated bindings of this object are named after.
    fn prefix(&mut self, object: &QmlObject<'a>, id: Option<&'a str>, is_root: bool) -> String {
        if let Some(id) = id {
            return id.to_string();
        }
        let has_members = object.members.iter().any(|member| {
            matches!(
                member,
                QmlMember::Property(_) | QmlMember::Function(_) | QmlMember::Signal(_)
            )
        });
        if !has_members {
            return String::new();
        }
        let stem = if is_root {
            "root".to_string()
        } else {
            let mut stem = object.type_name.last().to_string();
            stem[..1].make_ascii_lowercase();
            stem
        };
        let mut candidate = stem.clone();
        let mut counter = 1;
        while !self.taken.insert(candidate.clone()) {
            counter += 1;
            candidate = format!("{stem}{counter}");
        }
        candidate
    }

    fn property(
        &mut self,
        property: &QmlPropertyDeclaration<'a>,
        owner: usize,
        id: Option<&'a str>,
        prefix: &str,
        is_root: bool,
    ) -> Member {
        let name = property.name.name.as_str();
        let js = format!("{prefix}${name}");
        let Some(type_name) = &property.type_name else {
            return Member::Unsupported("`required` on an inherited property");
        };
        if type_name.name.as_simple() == Some("alias") {
            if !is_root {
                return Member::Unsupported("aliases outside a component's root object");
            }
            let Some((target, target_property)) = alias_target(property) else {
                return Member::Unsupported("aliases of anything but `id.property`");
            };
            self.pending.push(Pending {
                owner,
                name,
                span: property.span,
                id: target,
                property: target_property,
                is_default: property.is_default,
                js,
                assigned: self.is_assigned(name, id),
            });
            // Replaced once the component's ids are all known.
            return Member::Unsupported("aliases of an unknown id");
        }
        let expression = match &property.value {
            None => None,
            Some(QmlBindingValue::Expression(expression)) => Some(expression),
            Some(QmlBindingValue::Statement(_)) => return self.writable_or(property, id, js, Member::Memo),
            Some(_) => return Member::Unsupported("objects as property values"),
        };
        if property.is_required {
            return if is_root {
                Member::Getter(js)
            } else {
                Member::Unsupported("required properties outside the root object")
            };
        }
        let literal = expression.is_none_or(is_literal);
        let cheap = literal || expression.is_some_and(is_member_chain);
        let overridable = is_root && !property.is_readonly;
        self.writable_or(property, id, js, |js| {
            if overridable {
                if cheap { Member::Getter(js) } else { Member::Memo(js) }
            } else if literal {
                Member::Const(js)
            } else if cheap {
                Member::Getter(js)
            } else {
                Member::Memo(js)
            }
        })
    }

    fn is_assigned(&self, name: &'a str, id: Option<&'a str>) -> bool {
        self.assigned.bare.contains(name)
            || id.is_some_and(|id| self.assigned.members.contains(&(id, name)))
    }

    fn writable_or(
        &self,
        property: &QmlPropertyDeclaration<'a>,
        id: Option<&'a str>,
        js: String,
        otherwise: impl FnOnce(String) -> Member,
    ) -> Member {
        if self.is_assigned(property.name.name.as_str(), id) && !property.is_readonly {
            let set = format!("set${js}");
            Member::Signal { get: js, set }
        } else {
            otherwise(js)
        }
    }

    /// Settles the aliases of the component rooted at `owner`, now that every
    /// id in it is known.
    fn aliases(&mut self, owner: usize) {
        let (own, pending): (Vec<_>, Vec<_>) =
            std::mem::take(&mut self.pending).into_iter().partition(|alias| alias.owner == owner);
        self.pending = pending;
        for alias in own {
            let Some(&target) = self.scopes.ids.get(&(owner, alias.id)) else {
                self.errors.push(Error::new(
                    format!("`{}` is not an id in this component", alias.id),
                    alias.span,
                ));
                // Reported here: the declaration has nothing more to say.
                self.scopes.objects[owner].members.remove(alias.name);
                continue;
            };
            let member = if alias.is_default {
                self.scopes.children.insert(owner, target);
                Member::Unsupported("reads of a default property alias")
            } else {
                self.alias(target, &alias)
            };
            self.scopes.objects[owner].members.insert(alias.name, member);
        }
    }

    fn alias(&mut self, target: usize, alias: &Pending<'a>) -> Member {
        let writable = |js: String| Member::Signal { set: format!("set${js}"), get: js };
        let members = &mut self.scopes.objects[target].members;
        let Some((&name, declared)) = members.get_key_value(alias.property.as_str()) else {
            // A built-in property: the alias is the binding and the target
            // reads it.
            let js = alias.js.clone();
            let member = if alias.assigned { writable(js) } else { Member::Getter(js) };
            self.scopes
                .aliases
                .insert((target, alias.property.clone()), Alias { name: alias.name, member: member.clone() });
            return member;
        };
        // A declared property: the alias is another name for its binding,
        // which the outside can now set, so it is no longer a constant.
        let member = match declared.clone() {
            Member::Const(js) | Member::Getter(js) | Member::Memo(js) if alias.assigned => writable(js),
            Member::Const(js) => Member::Getter(js),
            Member::Function(_) => return Member::Unsupported("aliases of functions and signals"),
            member => member,
        };
        if member.is_property() {
            members.insert(name, member.clone());
            self.scopes.aliased.insert((target, name), alias.name);
        }
        member
    }
}

/// The `id` and property path of `property alias name: id.property`.
pub(crate) fn alias_target<'a>(property: &QmlPropertyDeclaration<'a>) -> Option<(&'a str, String)> {
    // A dialect's aliases are of a property (`id.property`), never of the
    // object itself, which the front end's reading also names.
    qml_front::scope::alias_target(property).filter(|(_, target)| !target.is_empty())
}

fn collect_ids(object: &QmlObject<'_>, ids: &mut HashSet<String>) {
    if let Some(id) = object_id(object) {
        ids.insert(id.to_string());
    }
    for member in &object.members {
        match member {
            QmlMember::Object(child) => collect_ids(child, ids),
            QmlMember::Binding(QmlBinding { value, .. })
            | QmlMember::Property(QmlPropertyDeclaration { value: Some(value), .. }) => match value {
                QmlBindingValue::Object(child) => collect_ids(child, ids),
                QmlBindingValue::Objects(children) => {
                    for child in children {
                        collect_ids(child, ids);
                    }
                }
                _ => {}
            },
            QmlMember::InlineComponent(inline) => collect_ids(&inline.object, ids),
            _ => {}
        }
    }
}


/// What a `Repeater` hands its delegate, decided by the shape of its model.
fn repeater_delegate(repeater: &QmlObject<'_>) -> Delegate {
    let count = repeater.members.iter().any(|member| {
        matches!(
            member,
            QmlMember::Binding(QmlBinding {
                name,
                value: QmlBindingValue::Expression(Expression::NumericLiteral(_)),
                ..
            }) if name.as_simple() == Some("model")
        )
    });
    if count { Delegate::COUNT } else { Delegate::EACH }
}


/// `a`, `a.b`, `a.b.c`: a read with no work in it.
fn is_member_chain(expression: &Expression<'_>) -> bool {
    match expression {
        Expression::Identifier(_) => true,
        Expression::StaticMemberExpression(member) => is_member_chain(&member.object),
        // Type syntax is erased, so it does not make a read any heavier.
        Expression::ParenthesizedExpression(inner) => is_member_chain(&inner.expression),
        Expression::TSAsExpression(inner) => is_member_chain(&inner.expression),
        Expression::TSSatisfiesExpression(inner) => is_member_chain(&inner.expression),
        Expression::TSNonNullExpression(inner) => is_member_chain(&inner.expression),
        _ => false,
    }
}

/// Every name the file's scripts assign to. A property nothing assigns to
/// needs no setter, whatever its declaration says.
#[derive(Default)]
struct Assigned<'a> {
    bare: HashSet<&'a str>,
    members: HashSet<(&'a str, &'a str)>,
}

impl<'a> Assigned<'a> {
    fn member(&mut self, member: &StaticMemberExpression<'a>) {
        if let Expression::Identifier(object) = &member.object {
            self.members.insert((object.name.as_str(), member.property.name.as_str()));
        }
    }
}

impl<'a> Visit<'a> for Assigned<'a> {
    fn visit_assignment_expression(&mut self, it: &AssignmentExpression<'a>) {
        match &it.left {
            AssignmentTarget::AssignmentTargetIdentifier(id) => {
                self.bare.insert(id.name.as_str());
            }
            AssignmentTarget::StaticMemberExpression(member) => self.member(member),
            _ => {}
        }
        walk::walk_assignment_expression(self, it);
    }

    fn visit_update_expression(&mut self, it: &UpdateExpression<'a>) {
        match &it.argument {
            SimpleAssignmentTarget::AssignmentTargetIdentifier(id) => {
                self.bare.insert(id.name.as_str());
            }
            SimpleAssignmentTarget::StaticMemberExpression(member) => self.member(member),
            _ => {}
        }
        walk::walk_update_expression(self, it);
    }
}


