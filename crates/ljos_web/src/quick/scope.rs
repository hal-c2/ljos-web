//! The objects of a file: what each is, what it declares, and whose names an
//! expression written in it may use.
//!
//! QML resolves a name at run time by walking contexts: the object the
//! expression belongs to, the root of its component, then the components
//! around it. Everything that walk needs is in the file and in the types it
//! names, so it is read off by the front end ([`qml_front::scope`]) and the
//! walk is done when the file is compiled. Kept here is what the lowering
//! names in the JavaScript it writes: the binding that holds each object
//! (its `id`, or a name no QML name can be) and the one that holds what a
//! delegate is given.

use std::collections::HashSet;

use oxc_ast::ast::{BindingIdentifier, Function, IdentifierReference};
use oxc_ast_visit::Visit;
use oxc_syntax::scope::ScopeFlags;
use qml_syntax::ast::{
    QmlBinding, QmlBindingValue, QmlDocument, QmlMember, QmlObject, QmlPropertyDeclaration,
};

use super::types::{Member, Property, Qt, Types};
use crate::Error;

pub(crate) use qml_front::scope::{CHANGES, object_id as id};

/// The front end's objects and contexts of one file.
pub(crate) type Front<'a> = qml_front::scope::Tree<'a, Qt>;

pub(crate) struct Tree<'a> {
    pub front: Front<'a>,
    /// The JavaScript binding that holds each object, in the order of
    /// `front.objects`: its `id`, or `sigils` and a number, in source order.
    handles: Vec<String>,
    /// What starts the name of an object without an id: `$`, or one `$`
    /// more than any name the file's scripts have of `$`s and a number (a
    /// pipe's steps are `$0`, `$1`, …), which would hide the object.
    sigils: String,
    /// The binding that holds what a delegate is given, in the order of
    /// `front.contexts`: `index`, the roles.
    datas: Vec<Option<String>>,
    /// Every id of the file, whichever component it is in.
    ids: HashSet<&'a str>,
}

impl<'a> std::ops::Deref for Tree<'a> {
    type Target = Front<'a>;

    fn deref(&self) -> &Front<'a> {
        &self.front
    }
}

impl<'a> Tree<'a> {
    pub(crate) fn analyze(
        document: &QmlDocument<'a>,
        types: Types<'_>,
        errors: &mut Vec<Error>,
    ) -> Self {
        let mut front_errors = Vec::new();
        let front = Front::analyze(document, types.front(), &mut front_errors);
        errors.extend(
            front_errors
                .into_iter()
                .map(|error| Error::new(error.message, error.span)),
        );

        let mut written = Written::default();
        written.object(&document.root);
        for id in front.objects.iter().filter_map(|object| object.id) {
            written.name(id);
        }
        let sigils = "$".repeat(written.most + 1);
        let mut handles = Vec::with_capacity(front.objects.len());
        let mut ids = HashSet::new();
        let mut next = 0;
        for object in &front.objects {
            match object.id {
                Some(id) => {
                    ids.insert(id);
                    handles.push(id.to_string());
                }
                None => {
                    next += 1;
                    handles.push(format!("{sigils}{next}"));
                }
            }
        }
        // A delegate inside a delegate is given its own, and still sees what
        // the one around it is given.
        let datas = front
            .contexts
            .iter()
            .map(|context| {
                context.is_delegate.then(|| {
                    let mut depth = 0;
                    let mut around = context.outer;
                    while let Some(index) = around {
                        depth += usize::from(front.contexts[index].is_delegate);
                        around = front.contexts[index].outer;
                    }
                    if depth == 0 {
                        "$data".to_string()
                    } else {
                        format!("$data{depth}")
                    }
                })
            })
            .collect();
        Self {
            front,
            handles,
            sigils,
            datas,
            ids,
        }
    }

    pub(crate) fn index_of(&self, object: &QmlObject<'a>) -> usize {
        self.front
            .index_of(object)
            .expect("an object of the file analysed")
    }

    /// Whether what a state changes at `offset` is of a target only the
    /// running program knows.
    pub(crate) fn aimed(&self, offset: u32) -> bool {
        self.front.aimed(offset).is_some()
    }

    /// The JavaScript binding that holds the object.
    pub(crate) fn handle(&self, index: usize) -> &str {
        &self.handles[index]
    }

    /// Whether `name` is one given here to an object without an id.
    pub(crate) fn is_unnamed(&self, name: &str) -> bool {
        name.strip_prefix(&self.sigils).is_some_and(is_number)
    }

    /// The binding that holds what the delegates of a context are given.
    pub(crate) fn data(&self, context: usize) -> Option<&str> {
        self.datas[context].as_deref()
    }

    /// The name of the binding that holds the context of the component the
    /// object is in: the file's, or an inline one's.
    pub(crate) fn scope_of(&self, index: usize) -> String {
        let mut context = self.objects[index].context;
        while let Some(outer) = self.contexts[context].outer {
            context = outer;
        }
        if context == 0 {
            "$scope".to_string()
        } else {
            format!("$scope{context}")
        }
    }

    /// The ids of the component whose root is `root` that its scripts reach
    /// as JavaScript bindings of its function: not the ones in a delegate.
    pub(crate) fn ids_of(&self, root: usize) -> Vec<&str> {
        let context = self.objects[root].context;
        self.objects
            .iter()
            .enumerate()
            .filter(|(_, object)| object.context == context && object.id.is_some())
            .map(|(index, _)| self.handles[index].as_str())
            .collect()
    }

    pub(crate) fn is_id(&self, name: &str) -> bool {
        self.ids.contains(name)
    }

    /// What `name` is on the object: something it declares, or a member of
    /// its type.
    pub(crate) fn member(&self, types: Types<'_>, index: usize, name: &str) -> Option<Member> {
        self.front.member(types.front(), index, name)
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
        self.front.signal(types.front(), index, name)
    }

    /// The property whose value the object's signal `name` carries to its
    /// handlers: [`types::carried`].
    pub(crate) fn carried<'n>(
        &self,
        types: Types<'_>,
        index: usize,
        name: &'n str,
    ) -> Option<&'n str> {
        let object = &self.objects[index];
        let property = name.strip_suffix("Changed")?;
        if object.declared.contains_key(name) || object.declared.contains_key(property) {
            return None;
        }
        types.carried(object.kind.as_ref()?, name)
    }

    /// What the property a binding names is, through the groups on the way:
    /// `border.width` is the `width` of what `border` is.
    pub(crate) fn property(
        &self,
        types: Types<'_>,
        index: usize,
        path: &[&str],
    ) -> Option<Property> {
        self.front.property(types.front(), index, path)
    }
}

/// `font { ... }`: an object whose "type" is a lowercase property name.
pub(crate) fn is_group(object: &QmlObject<'_>) -> bool {
    qml_front::scope::is_group(object)
}

fn is_number(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit())
}

/// The most `$`s before a number in a name the file's scripts declare or
/// read.
#[derive(Default)]
struct Written {
    most: usize,
}

impl Written {
    fn name(&mut self, name: &str) {
        let number = name.trim_start_matches('$');
        if is_number(number) {
            self.most = self.most.max(name.len() - number.len());
        }
    }

    fn object(&mut self, object: &QmlObject<'_>) {
        for member in &object.members {
            match member {
                QmlMember::Object(child) => self.object(child),
                QmlMember::InlineComponent(inline) => self.object(&inline.object),
                QmlMember::Binding(QmlBinding { value, .. })
                | QmlMember::Property(QmlPropertyDeclaration {
                    value: Some(value), ..
                }) => match value {
                    QmlBindingValue::Expression(expression) => self.visit_expression(expression),
                    QmlBindingValue::Statement(statement) => self.visit_statement(statement),
                    QmlBindingValue::Object(child) => self.object(child),
                    QmlBindingValue::Objects(children) => {
                        for child in children {
                            self.object(child);
                        }
                    }
                },
                // Its parameters too, not only its body.
                QmlMember::Function(function) => {
                    let function: &Function<'_> = function;
                    self.visit_function(function, ScopeFlags::Function);
                }
                QmlMember::Signal(signal) => {
                    for param in &signal.params {
                        self.name(param.name.name.as_str());
                    }
                }
                _ => {}
            }
        }
    }
}

impl<'a> Visit<'a> for Written {
    fn visit_binding_identifier(&mut self, identifier: &BindingIdentifier<'a>) {
        self.name(identifier.name.as_str());
    }

    fn visit_identifier_reference(&mut self, identifier: &IdentifierReference<'a>) {
        self.name(identifier.name.as_str());
    }
}
