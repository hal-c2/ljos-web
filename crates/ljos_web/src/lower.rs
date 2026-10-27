//! QML object tree → the Oxc AST Solid's compiler consumes.
//!
//! The output is the tree Solid would have parsed out of JSX: elements,
//! attributes, a `style` object, `<For>` around delegates, a component function
//! around the lot. It is built node by node in the parser's arena. No JSX text
//! exists at any point, and the binding expressions are the nodes the QML
//! parser produced, moved into place with their source spans intact.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use oxc_allocator::{ArenaVec, CloneIn};
use oxc_ast::ast::*;
use qml_syntax::ast::*;
use oxc_span::Span;
use oxc_syntax::operator::BinaryOperator;

use crate::{
    Error,
    build::B,
    project::{Declared, Key, Lookup, Project, Usage, is_group},
    registry::{Element, Prop, Type, Types, Unit},
    scope::{Member, Own, Scopes, is_literal},
};

/// The declarations of one JavaScript scope: the component function or a
/// delegate callback. Kept in tiers so that nothing reads a binding before its
/// declaration ran, whatever order the QML declared them in.
#[derive(Default)]
struct Declarations<'a> {
    constants: Vec<Statement<'a>>,
    lazy: Vec<Statement<'a>>,
    eager: Vec<Statement<'a>>,
    /// Change handlers and lifecycle hooks: they read anything, so they come
    /// last.
    effects: Vec<Statement<'a>>,
}

impl<'a> Declarations<'a> {
    fn is_empty(&self) -> bool {
        self.constants.is_empty()
            && self.lazy.is_empty()
            && self.eager.is_empty()
            && self.effects.is_empty()
    }

    fn finish(self, b: B<'a>, result: Expression<'a>) -> ArenaVec<'a, Statement<'a>> {
        let mut statements = b.vec();
        statements.extend(self.constants);
        statements.extend(self.lazy);
        statements.extend(self.eager);
        statements.extend(self.effects);
        statements.push(b.return_(result));
        statements
    }
}

/// What a QML object becomes.
#[derive(Clone)]
enum Kind<'a> {
    /// A type of an imported dialect: a DOM element.
    Element(&'static Element),
    /// A component. Without a key it is one nothing is known about, which is
    /// taken at its word.
    Instance { type_name: &'a str, key: Option<Key> },
}

/// The pieces of an element or instance, gathered while walking its members.
struct Parts<'a> {
    attributes: ArenaVec<'a, JSXAttributeItem<'a>>,
    style: Vec<(&'a str, Expression<'a>)>,
    events: Vec<JSXAttributeItem<'a>>,
    text: Option<Expression<'a>>,
    children: ArenaVec<'a, JSXChild<'a>>,
}

/// A member of an object, with property groups flattened into bindings.
enum Entry<'a> {
    Binding { name: String, name_span: Span, span: Span, value: QmlBindingValue<'a> },
    Member(QmlMember<'a>),
}

/// The handlers an object has for its own signals and properties. They are
/// part of those declarations, wherever in the object they are written.
#[derive(Default)]
struct Handlers<'a> {
    signals: HashMap<String, Expression<'a>>,
    changed: BTreeMap<String, Expression<'a>>,
}

/// How a property of an object is reached from outside its component.
enum Outer<'a> {
    /// An instance of the component sets it on the component's root.
    Override,
    /// A root alias of this name stands for it.
    Alias(&'a str, Member),
}

pub(crate) struct Lower<'a, 's> {
    b: B<'a>,
    scopes: &'s Scopes<'a>,
    types: Types,
    project: &'s Project,
    usages: &'s HashMap<Key, Usage>,
    /// Whether a type nothing describes is taken to be a component.
    open: bool,
    /// The component being lowered: the file's, or one of its inline ones.
    component: Key,
    pub errors: Vec<Error>,
    /// Component types used, each an import of a sibling file.
    pub components: BTreeSet<&'a str>,
    /// Names needed from `solid-js`.
    pub solid: BTreeSet<&'static str>,
    /// Names needed from the runtime module.
    pub runtime: BTreeSet<&'static str>,
    /// The inline components: functions of the module.
    pub inline: Vec<Statement<'a>>,
}

impl<'a, 's> Lower<'a, 's> {
    pub(crate) fn new(
        b: B<'a>,
        scopes: &'s Scopes<'a>,
        types: Types,
        project: &'s Project,
        usages: &'s HashMap<Key, Usage>,
        file: &str,
        open: bool,
    ) -> Self {
        Self {
            b,
            scopes,
            types,
            project,
            usages,
            open,
            component: Key { file: file.to_string(), inline: None },
            errors: Vec::new(),
            components: BTreeSet::new(),
            solid: BTreeSet::new(),
            runtime: BTreeSet::new(),
            inline: Vec::new(),
        }
    }

    /// `export default function Name(props) { declarations; return <root/>; }`
    pub(crate) fn component(&mut self, name: &str, root: QmlObject<'a>) -> Option<Statement<'a>> {
        let body = self.body(root)?;
        Some(self.b.export_default_function(name, &["props"], body))
    }

    fn body(&mut self, root: QmlObject<'a>) -> Option<ArenaVec<'a, Statement<'a>>> {
        let mut declarations = Declarations::default();
        let element = self.object(root, &mut declarations)?;
        Some(declarations.finish(self.b, element))
    }

    /// `component Name: Type { }` is a component like a file's, in the same
    /// module: `function Name(props) { ... }`.
    fn inline_component(&mut self, inline: QmlInlineComponent<'a>) -> bool {
        let name = inline.name.name.as_str();
        let key = Key { file: self.component.file.clone(), inline: Some(name.to_string()) };
        let enclosing = std::mem::replace(&mut self.component, key);
        let body = self.body(inline.object);
        self.component = enclosing;
        let Some(body) = body else { return false };
        self.inline.push(self.b.function_declaration(name, &["props"], body));
        true
    }

    fn error(&mut self, message: impl Into<String>, span: Span) {
        self.errors.push(Error::new(message, span));
    }

    fn object(
        &mut self,
        object: QmlObject<'a>,
        declarations: &mut Declarations<'a>,
    ) -> Option<Expression<'a>> {
        if object.on.is_some() {
            self.error("`Type on property` value sources are not supported yet", object.span);
            return None;
        }
        let Some(type_name) = object.type_name.as_simple() else {
            self.error(
                format!("qualified type `{}` is not supported yet", object.type_name),
                object.type_name.span,
            );
            return None;
        };
        match self.types.lookup(type_name) {
            Some(Type::Element(element)) => self.item(Kind::Element(element), object, declarations),
            Some(Type::Repeater) => self.repeater(object),
            None if self.types.is_known_unsupported(type_name) => {
                self.error(
                    format!("`{type_name}` is not supported by the web target yet"),
                    object.type_name.span,
                );
                None
            }
            None if type_name.starts_with(|c: char| c.is_ascii_uppercase()) => {
                let key = self.project.resolve(&self.component.file, type_name);
                if key.is_none() && !self.open {
                    self.error(
                        format!(
                            "`{type_name}` is not a type: no imported module the web target knows \
                             has it, and no `{type_name}.qml` is next to this file"
                        ),
                        object.type_name.span,
                    );
                    return None;
                }
                self.item(Kind::Instance { type_name, key }, object, declarations)
            }
            None => {
                self.error(format!("`{type_name}` is not a type"), object.type_name.span);
                None
            }
        }
    }

    /// An object that is an element or a component instance: its bindings,
    /// children and declarations.
    fn item(
        &mut self,
        kind: Kind<'a>,
        object: QmlObject<'a>,
        declarations: &mut Declarations<'a>,
    ) -> Option<Expression<'a>> {
        let b = self.b;
        let index = self.scopes.index_of(&object);
        let type_name = object.type_name.last();
        let span = object.span;
        let mut parts = Parts {
            attributes: b.vec(),
            style: Vec::new(),
            events: Vec::new(),
            text: None,
            children: b.vec(),
        };
        if let Kind::Element(Element { class: Some(class), .. }) = kind {
            parts.attributes.push(b.attr_string("class", class));
        }

        let mut ok = true;
        let mut handlers = Handlers::default();
        let mut entries = Vec::new();
        for member in object.members {
            match member {
                QmlMember::Binding(binding) => {
                    let entry = Entry::Binding {
                        name: binding.name.to_string(),
                        name_span: binding.name.span,
                        span: binding.span,
                        value: binding.value,
                    };
                    ok &= self.entry(index, entry, &mut handlers, &mut entries, declarations);
                }
                // `font { bold: true }` is `font.bold: true`.
                QmlMember::Object(group) if is_group(&group) => {
                    let prefix = group.type_name.to_string();
                    for member in group.members {
                        let QmlMember::Binding(binding) = member else {
                            self.error("only bindings are allowed in a property group", group.span);
                            ok = false;
                            continue;
                        };
                        entries.push(Entry::Binding {
                            name: format!("{prefix}.{}", binding.name),
                            name_span: binding.name.span,
                            span: binding.span,
                            value: binding.value,
                        });
                    }
                }
                member => entries.push(Entry::Member(member)),
            }
        }

        let mut outer = self.outer(&kind, index);
        for entry in entries {
            match entry {
                Entry::Binding { name, .. } if name == "id" => {}
                Entry::Binding { name, name_span, span, value } => {
                    let outer = outer.remove(&name);
                    let binding = Binding { name: &name, name_span, span, value: Some(value), outer };
                    ok &= self.binding(&kind, type_name, binding, &mut parts, declarations);
                }
                Entry::Member(QmlMember::Object(child)) => match self.object(child, declarations) {
                    Some(child) => parts.children.push(b.child(child)),
                    None => ok = false,
                },
                Entry::Member(QmlMember::Property(property)) => {
                    ok &= self.property(property, index, declarations);
                }
                Entry::Member(QmlMember::Function(mut function)) => {
                    let name = function.id.as_ref().map(|id| id.name.as_str()).unwrap_or_default();
                    if let Some(Member::Function(js)) = self.scopes.member(index, name) {
                        if let Some(id) = &mut function.id {
                            id.name = b.ident(js);
                        }
                        declarations.constants.push(Statement::FunctionDeclaration(function));
                    }
                }
                Entry::Member(QmlMember::Signal(signal)) => {
                    let name = signal.name.name.as_str();
                    let handler = handlers.signals.remove(name);
                    self.signal(index, name, handler, declarations);
                }
                Entry::Member(QmlMember::InlineComponent(inline)) => {
                    ok &= self.inline_component(inline);
                }
                Entry::Member(QmlMember::Enum(declaration)) => {
                    self.errors.push(Error::new("an `enum` is QtQuick's: this dialect has none", declaration.span));
                    ok = false;
                }
                Entry::Member(QmlMember::Binding(_)) => unreachable!("bindings are entries"),
            }
        }
        // What the outside sets and the object does not bind itself.
        for (name, outer) in outer {
            let binding =
                Binding { name: &name, name_span: span, span, value: None, outer: Some(outer) };
            ok &= self.binding(&kind, type_name, binding, &mut parts, declarations);
        }
        self.changed(index, handlers.changed, declarations);
        if self.takes_children(index) {
            parts.children.push(b.child(b.member(b.id("props"), "children")));
        }
        if !ok {
            return None;
        }

        let Parts { mut attributes, style, events, text, children } = parts;
        match kind {
            Kind::Element(element) => {
                if !style.is_empty() {
                    attributes.push(b.attr("style", b.object(style)));
                }
                attributes.extend(events);
                let mut all_children = b.vec();
                if let Some(text) = text {
                    all_children.push(b.child(text));
                }
                all_children.extend(children);
                Some(b.element(element.tag, attributes, all_children))
            }
            Kind::Instance { type_name, key } => {
                // An inline component is a function of this module, and so is
                // the file's own component; any other is a file to import.
                let is_local = key
                    .is_some_and(|key| key.inline.is_some() || key.file == self.component.file);
                if !is_local {
                    self.components.insert(type_name);
                }
                Some(b.element(type_name, attributes, children))
            }
        }
    }

    /// Sorts a binding: a handler of something the object declares goes to
    /// that declaration, anything else is a binding of the object.
    fn entry(
        &mut self,
        index: usize,
        entry: Entry<'a>,
        handlers: &mut Handlers<'a>,
        entries: &mut Vec<Entry<'a>>,
        declarations: &mut Declarations<'a>,
    ) -> bool {
        let b = self.b;
        let scopes = self.scopes;
        let Entry::Binding { name, span, .. } = &entry else { unreachable!("called on a binding") };
        let (span, own) = (*span, scopes.objects[index].own(name));
        let value = |entry| match entry {
            Entry::Binding { value, .. } => value,
            Entry::Member(_) => unreachable!("called on a binding"),
        };
        match own {
            None => entries.push(entry),
            Some(Own::Signal(signal)) => {
                let parameters = &scopes.objects[index].signals[signal.as_str()];
                let Some(handler) = self.handler(value(entry), parameters, span, false) else {
                    return false;
                };
                handlers.signals.insert(signal, handler);
            }
            Some(Own::Changed(property)) => {
                let Some(handler) = self.handler(value(entry), &[], span, true) else {
                    return false;
                };
                handlers.changed.insert(property, handler);
            }
            Some(lifecycle @ (Own::Completed | Own::Destruction)) => {
                let Some(handler) = self.handler(value(entry), &[], span, true) else {
                    return false;
                };
                let hook = if lifecycle == Own::Completed { "onSettled" } else { "onCleanup" };
                self.solid.insert(hook);
                declarations.effects.push(b.statement(b.call(b.id(hook), [handler])));
            }
        }
        true
    }

    /// The properties of the object that are set from outside its component.
    fn outer(&self, kind: &Kind<'a>, index: usize) -> BTreeMap<String, Outer<'a>> {
        let mut outer = BTreeMap::new();
        if self.scopes.is_interface(index)
            && let Some(usage) = self.usages.get(&self.component)
            && let Some(interface) = self.project.interface(&self.component)
        {
            for name in &usage.names {
                if interface.declares(name).is_some() {
                    continue;
                }
                // What the root cannot take is reported where an instance
                // sets it, not here.
                let takes = match kind {
                    Kind::Element(element) => {
                        element.prop(name).is_some_and(|prop| !matches!(prop, Prop::Keyword(_)))
                    }
                    Kind::Instance { .. } => true,
                };
                if takes {
                    outer.insert(name.clone(), Outer::Override);
                }
            }
        }
        for ((target, property), alias) in &self.scopes.aliases {
            if *target == index {
                outer.insert(property.clone(), Outer::Alias(alias.name, alias.member.clone()));
            }
        }
        outer
    }

    /// Whether the children an instance of the component is given go here.
    fn takes_children(&self, index: usize) -> bool {
        let root = self.scopes.objects[index].document;
        let target = self.scopes.children.get(&root).copied().unwrap_or(root);
        target == index && self.usages.get(&self.component).is_some_and(|usage| usage.children)
    }

    /// `props.key`, or the component's own value when no instance sets it.
    fn props_or(&self, key: &str, own: Option<Expression<'a>>) -> Expression<'a> {
        let b = self.b;
        let given = || b.member(b.id("props"), key);
        match own {
            Some(own) => b.conditional(
                b.binary(given(), BinaryOperator::StrictInequality, b.id("undefined")),
                given(),
                own,
            ),
            None => given(),
        }
    }

    /// `(...$args) => { first(...$args); props.key?.(...$args); }`: a handler
    /// in the component and one on its instance both run.
    fn both(&self, first: Option<Expression<'a>>, key: &str) -> Expression<'a> {
        let b = self.b;
        let mut statements = b.vec();
        if let Some(first) = first {
            statements.push(b.statement(b.call_spread(first, "$args")));
        }
        let given = b.member(b.id("props"), key);
        statements.push(b.statement(b.optional_call_spread(given, "$args")));
        b.arrow_rest_block("$args", statements)
    }

    /// The value of a property the outside reaches: what an instance gives
    /// wins over what the component binds itself.
    fn outside(
        &mut self,
        key: &str,
        outer: Option<Outer<'a>>,
        own: Option<Expression<'a>>,
        declarations: &mut Declarations<'a>,
    ) -> Expression<'a> {
        let b = self.b;
        match outer {
            None => own.expect("a binding has a value unless the outside gives it one"),
            Some(Outer::Override) => self.props_or(key, own),
            // The alias is the binding, declared here where its default is,
            // and the property reads it.
            Some(Outer::Alias(name, member)) => {
                let value = b.arrow(&[], self.props_or(name, own));
                match member {
                    Member::Signal { get, set } => {
                        self.solid.insert("createSignal");
                        let signal = b.call(b.id("createSignal"), [value]);
                        declarations.eager.push(b.const_pair(&get, &set, signal));
                        b.call(b.id(&get), [])
                    }
                    Member::Getter(js) => {
                        declarations.constants.push(b.const_(&js, value));
                        b.call(b.id(&js), [])
                    }
                    _ => unreachable!("an alias of a built-in property is a getter or a signal"),
                }
            }
        }
    }

    /// One `name: value` on an object. On an element it is placed by what the
    /// registry says the property means on this target; on a component
    /// instance it is a prop.
    fn binding(
        &mut self,
        kind: &Kind<'a>,
        type_name: &str,
        binding: Binding<'_, 'a>,
        parts: &mut Parts<'a>,
        declarations: &mut Declarations<'a>,
    ) -> bool {
        let b = self.b;
        let Binding { name, name_span, span, value, outer } = binding;
        // A prop is an identifier, a QML name may be dotted.
        let key = name.replace('.', "$");
        let element = match kind {
            Kind::Element(element) => *element,
            Kind::Instance { key: component, .. } => {
                let lookup = match component {
                    Some(component) => self.project.lookup(component, name),
                    None => Lookup::Unknown,
                };
                let parameters = match lookup {
                    // Asked of this component by its own instances: where
                    // they are written is where it is reported.
                    Lookup::Fixed | Lookup::Missing if value.is_none() => return true,
                    Lookup::Value => None,
                    Lookup::Handler(parameters) => Some(parameters),
                    Lookup::Unknown => is_handler_name(name).then(Vec::new),
                    Lookup::Fixed => {
                        self.error(
                            format!(
                                "`{name}` of `{type_name}` cannot be set from outside the component yet"
                            ),
                            name_span,
                        );
                        return false;
                    }
                    Lookup::Missing => {
                        self.error(format!("`{type_name}` has no property `{name}`"), name_span);
                        return false;
                    }
                };
                let value = match parameters {
                    Some(parameters) => {
                        let parameters: Vec<&str> = parameters.iter().map(String::as_str).collect();
                        let own = match value {
                            Some(value) => match self.handler(value, &parameters, span, false) {
                                Some(handler) => Some(handler),
                                None => return false,
                            },
                            None => None,
                        };
                        match outer {
                            None => own.expect("a binding has a value unless the outside gives it one"),
                            Some(Outer::Override) if own.is_none() => b.member(b.id("props"), &key),
                            Some(Outer::Override) => self.both(own, &key),
                            Some(Outer::Alias(..)) => {
                                self.error("a signal handler cannot be aliased", span);
                                return false;
                            }
                        }
                    }
                    None => {
                        let own = match value {
                            Some(value) => match self.expression(value, span) {
                                Some(value) => Some(value),
                                None => return false,
                            },
                            None => None,
                        };
                        self.outside(&key, outer, own, declarations)
                    }
                };
                parts.attributes.push(b.attr(&key, value));
                return true;
            }
        };

        let Some(prop) = element.prop(name) else {
            self.error(
                format!("`{type_name}` has no property `{name}` on the web target yet"),
                name_span,
            );
            return false;
        };
        if let Prop::Event(event) = prop {
            let own = match value {
                Some(value) => match self.handler(value, &[], span, false) {
                    Some(handler) => Some(handler),
                    None => return false,
                },
                None => None,
            };
            let handler = match outer {
                None => own.expect("a binding has a value unless the outside gives it one"),
                Some(Outer::Override) if own.is_none() => b.member(b.id("props"), &key),
                Some(Outer::Override) => self.both(own, &key),
                Some(Outer::Alias(..)) => {
                    self.error("a signal handler cannot be aliased", span);
                    return false;
                }
            };
            parts.events.push(b.attr(event, handler));
            return true;
        }
        let own = match value {
            Some(value) => match self.expression(value, span) {
                Some(value) => Some(value),
                None => return false,
            },
            None => None,
        };
        if outer.is_some() && matches!(prop, Prop::Keyword(_)) {
            self.error(
                format!("`{name}` cannot be aliased or set from outside the component yet"),
                span,
            );
            return false;
        }
        // What the property is when nothing sets it. Off needs no saying:
        // nothing is not on.
        let own = own.or_else(|| match prop {
            Prop::Toggle { on, .. } if on.is_empty() => Some(b.boolean(true)),
            _ => None,
        });
        let value = self.outside(&key, outer, own, declarations);
        match prop {
            Prop::Style { css, unit } => {
                let value = self.with_unit(value, unit);
                self.spread(css.iter().copied(), value, &mut parts.style);
            }
            Prop::Toggle { on, off } => match as_boolean(&value) {
                Some(true) => parts.style.extend(on.iter().map(|(k, v)| (*k, b.string(v)))),
                Some(false) => parts.style.extend(off.iter().map(|(k, v)| (*k, b.string(v)))),
                None => {
                    let mut names: Vec<&'static str> = on.iter().map(|(k, _)| *k).collect();
                    names.extend(off.iter().map(|(k, _)| *k).filter(|k| !on.iter().any(|o| o.0 == *k)));
                    let declared = |table: &'static [(&'static str, &'static str)], key| {
                        table
                            .iter()
                            .find(|(k, _)| *k == key)
                            .map_or_else(|| b.void_0(), |(_, v)| b.string(v))
                    };
                    let last = names.len() - 1;
                    let mut test = Some(value);
                    for (position, key) in names.into_iter().enumerate() {
                        let test = if position == last {
                            test.take().expect("one test per declaration")
                        } else {
                            test.as_ref().expect("test kept until the last").clone_in(b.allocator())
                        };
                        parts.style.push((
                            key,
                            b.conditional(test, declared(on, key), declared(off, key)),
                        ));
                    }
                }
            },
            Prop::Keyword(table) => {
                let Expression::StringLiteral(literal) = &value else {
                    self.error(
                        format!("`{name}` must be a string literal on the web target for now"),
                        span,
                    );
                    return false;
                };
                let keyword = literal.value.as_str();
                let Some((_, declarations)) = table.iter().find(|(k, _)| *k == keyword) else {
                    self.error(format!("`{keyword}` is not a known value for `{name}`"), span);
                    return false;
                };
                parts.style.extend(declarations.iter().map(|(k, v)| (*k, b.string(v))));
            }
            Prop::Attribute(attribute) => parts.attributes.push(match &value {
                Expression::StringLiteral(literal) => b.attr_string(attribute, literal.value.as_str()),
                _ => b.attr(attribute, value),
            }),
            Prop::Text => parts.text = Some(value),
            Prop::Event(_) => unreachable!("handled above"),
        }
        true
    }

    /// `signal picked(index)` is the function that emits it: it runs the
    /// object's own handler and, on a component's root, the instance's.
    fn signal(
        &mut self,
        index: usize,
        name: &str,
        own: Option<Expression<'a>>,
        declarations: &mut Declarations<'a>,
    ) {
        let b = self.b;
        let Some(Member::Function(js)) = self.scopes.member(index, name) else { return };
        let emit = if self.scopes.is_interface(index) {
            self.both(own, &handler_name(name))
        } else {
            own.unwrap_or_else(|| b.arrow_block(&[], b.vec()))
        };
        declarations.constants.push(b.const_(js, emit));
    }

    /// `onTitleChanged` runs when `title` changes, not when it is first set.
    fn changed(
        &mut self,
        index: usize,
        mut own: BTreeMap<String, Expression<'a>>,
        declarations: &mut Declarations<'a>,
    ) {
        let b = self.b;
        let mut properties: BTreeSet<String> = own.keys().cloned().collect();
        // An instance may handle the changes of the component's properties.
        let mut outside = BTreeSet::new();
        if self.scopes.is_interface(index)
            && let Some(usage) = self.usages.get(&self.component)
            && let Some(interface) = self.project.interface(&self.component)
        {
            for name in &usage.names {
                if let Some(Declared::Changed(property)) = interface.declares(name) {
                    properties.insert(property.clone());
                    outside.insert(property);
                }
            }
        }
        for property in properties {
            let own = own.remove(&property);
            let read = match self.scopes.member(index, &property) {
                Some(Member::Getter(js) | Member::Memo(js) | Member::Signal { get: js, .. }) => {
                    b.id(js)
                }
                // A constant never changes.
                _ => continue,
            };
            let handler = if outside.contains(&property) {
                self.both(own, &handler_name(&format!("{property}Changed")))
            } else {
                own.expect("a property is here for its own handler or the outside's")
            };
            self.solid.insert("createEffect");
            let options = b.object([("defer", b.boolean(true))]);
            let effect = b.call(b.id("createEffect"), [read, handler, options]);
            declarations.effects.push(b.statement(effect));
        }
    }

    /// The same value for each of several CSS properties.
    fn spread(
        &self,
        names: impl ExactSizeIterator<Item = &'a str>,
        value: Expression<'a>,
        style: &mut Vec<(&'a str, Expression<'a>)>,
    ) {
        let last = names.len() - 1;
        let mut value = Some(value);
        for (position, name) in names.enumerate() {
            let value = if position == last {
                value.take().expect("one value per property")
            } else {
                value.as_ref().expect("value kept until the last").clone_in(self.b.allocator())
            };
            style.push((name, value));
        }
    }

    /// Gives a cell count its CSS unit. Literals are converted here, so they
    /// stay static and Solid folds them into the template; only a value that
    /// is not known until run time pays for a helper call.
    fn with_unit(&mut self, value: Expression<'a>, unit: Unit) -> Expression<'a> {
        let b = self.b;
        if unit == Unit::None {
            return value;
        }
        match value {
            Expression::NumericLiteral(number) => {
                b.string(&format!("{}{}", number.value, unit.suffix()))
            }
            Expression::StringLiteral(_) => value,
            Expression::ParenthesizedExpression(inner) => {
                self.with_unit(inner.unbox().expression, unit)
            }
            Expression::ConditionalExpression(conditional) => {
                let conditional = conditional.unbox();
                let consequent = self.with_unit(conditional.consequent, unit);
                let alternate = self.with_unit(conditional.alternate, unit);
                b.conditional(conditional.test, consequent, alternate)
            }
            value => {
                let helper = match unit {
                    Unit::Ch => "$ch",
                    Unit::Lh => "$lh",
                    Unit::Px => "$px",
                    Unit::None => unreachable!(),
                };
                self.runtime.insert(helper);
                b.call(b.id(helper), [value])
            }
        }
    }

    /// A binding's value as an expression. A script block becomes a call of an
    /// arrow with that body, which Solid reads as a reactive expression.
    fn expression(&mut self, value: QmlBindingValue<'a>, span: Span) -> Option<Expression<'a>> {
        let b = self.b;
        match value {
            QmlBindingValue::Expression(expression) => Some(expression),
            QmlBindingValue::Statement(statement) => {
                Some(b.call(b.arrow_block(&[], self.statements(statement)), []))
            }
            QmlBindingValue::Object(_) | QmlBindingValue::Objects(_) => {
                self.error("an object is not supported as this property's value yet", span);
                None
            }
        }
    }

    fn statements(&self, statement: Statement<'a>) -> ArenaVec<'a, Statement<'a>> {
        match statement {
            Statement::BlockStatement(block) => block.unbox().body,
            statement => self.b.vec1(statement),
        }
    }

    /// A signal handler: the function to call, not a value to track. The
    /// signal's parameters are in scope by name. With `block`, the script's
    /// value is not the function's: what calls it would take it for a cleanup.
    fn handler(
        &mut self,
        value: QmlBindingValue<'a>,
        parameters: &[&str],
        span: Span,
        block: bool,
    ) -> Option<Expression<'a>> {
        let b = self.b;
        match value {
            QmlBindingValue::Expression(expression) => Some(match unparenthesized(&expression) {
                Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => {
                    expression
                }
                _ if block => b.arrow_block(parameters, b.vec1(b.statement(expression))),
                _ => b.arrow(parameters, expression),
            }),
            QmlBindingValue::Statement(statement) => {
                Some(b.arrow_block(parameters, self.statements(statement)))
            }
            QmlBindingValue::Object(_) | QmlBindingValue::Objects(_) => {
                self.error("a signal handler must be a script", span);
                None
            }
        }
    }

    fn property(
        &mut self,
        property: QmlPropertyDeclaration<'a>,
        object: usize,
        declarations: &mut Declarations<'a>,
    ) -> bool {
        let b = self.b;
        let name = property.name.name.as_str();
        let Some(member) = self.scopes.member(object, name).cloned() else { return false };
        let is_alias = property
            .type_name
            .as_ref()
            .is_some_and(|type_name| type_name.name.as_simple() == Some("alias"));
        if is_alias {
            // Declared where its target is.
            return match member {
                _ if property.is_default && self.scopes.children.contains_key(&object) => true,
                Member::Unsupported(what) => {
                    self.error(format!("{what} are not supported yet"), property.span);
                    false
                }
                _ => true,
            };
        }
        // A root property is the component's interface, and so is a property
        // a root alias stands for: the instance's value wins over the default.
        let is_interface = self.scopes.is_interface(object) && !property.is_readonly;
        let outside =
            self.scopes.aliased.get(&(object, name)).copied().or(is_interface.then_some(name));
        let from_props = outside.is_some();
        let literal = match &property.value {
            None => true,
            Some(QmlBindingValue::Expression(expression)) => is_literal(expression),
            Some(_) => false,
        };

        let default = match property.value {
            None => Value::Expression(b.void_0()),
            Some(QmlBindingValue::Expression(expression)) => Value::Expression(expression),
            Some(QmlBindingValue::Statement(statement)) => Value::Block(self.statements(statement)),
            Some(_) => {
                self.error("an object is not supported as a property value yet", property.span);
                return false;
            }
        };
        let value = if property.is_required {
            Value::Expression(b.member(b.id("props"), name))
        } else if let Some(key) = outside {
            Value::Expression(self.props_or(key, Some(default.into_expression(b))))
        } else {
            default
        };

        match member {
            Member::Const(js) => {
                declarations.constants.push(b.const_(&js, value.into_expression(b)));
            }
            Member::Getter(js) => declarations.constants.push(b.const_(&js, value.into_thunk(b))),
            Member::Memo(js) => {
                self.solid.insert("createMemo");
                // Lazy: a binding is computed when something first reads it,
                // so declaration order never matters, as in QML.
                let options = b.object([("lazy", b.boolean(true))]);
                let memo = b.call(b.id("createMemo"), [value.into_thunk(b), options]);
                declarations.lazy.push(b.const_(&js, memo));
            }
            Member::Signal { get, set } => {
                self.solid.insert("createSignal");
                // A derived default is a writable memo: an assignment holds
                // until the default's own dependencies change.
                let initial = if literal && !from_props {
                    value.into_expression(b)
                } else {
                    value.into_thunk(b)
                };
                let signal = b.call(b.id("createSignal"), [initial]);
                declarations.eager.push(b.const_pair(&get, &set, signal));
            }
            Member::Function(_) => {}
            Member::Unsupported(what) => {
                self.error(format!("{what} are not supported yet"), property.span);
                return false;
            }
        }
        true
    }

    /// `Repeater { model; delegate }` → `<For each={model}>{(item, index) => delegate}</For>`,
    /// or `<Repeat count={n}>` when the model is a number.
    fn repeater(&mut self, object: QmlObject<'a>) -> Option<Expression<'a>> {
        let b = self.b;
        let span = object.span;
        let mut model = None;
        let mut delegate = None;
        let mut ok = true;
        for member in object.members {
            match member {
                QmlMember::Binding(binding) => match binding.name.to_string().as_str() {
                    "id" => {}
                    "model" => model = self.expression(binding.value, binding.span),
                    "delegate" => match binding.value {
                        QmlBindingValue::Object(object) => delegate = Some(object),
                        _ => {
                            self.error("a delegate must be an object", binding.span);
                            ok = false;
                        }
                    },
                    name => {
                        self.error(
                            format!("`Repeater` has no property `{name}` on the web target yet"),
                            binding.name.span,
                        );
                        ok = false;
                    }
                },
                QmlMember::Object(object) if delegate.is_none() => delegate = Some(object),
                _ => {
                    self.error("a Repeater takes a model and one delegate", span);
                    ok = false;
                }
            }
        }
        let (Some(model), Some(delegate), true) = (model, delegate, ok) else {
            if ok {
                self.error("a Repeater needs a model and a delegate", span);
            }
            return None;
        };

        let provided = self.scopes.objects[self.scopes.index_of(&delegate)]
            .delegate
            .expect("the analysis marks every delegate root");
        let mut declarations = Declarations::default();
        let element = self.object(delegate, &mut declarations)?;
        let (tag, source, parameters): (_, _, &[&str]) = if provided.count {
            ("Repeat", "count", &[provided.index.js])
        } else {
            ("For", "each", &[provided.model_data.js, provided.index.js])
        };
        // Only a literal is known to be a count. Any other model may still
        // turn out to be a number, which `$model` makes into its indices.
        let model = if provided.count {
            model
        } else {
            self.runtime.insert("$model");
            b.call(b.id("$model"), [model])
        };
        let callback = if declarations.is_empty() {
            b.arrow(parameters, element)
        } else {
            b.arrow_block(parameters, declarations.finish(b, element))
        };
        Some(b.element(tag, b.vec1(b.attr(source, model)), b.vec1(b.child(callback))))
    }
}

/// A binding of an object, or a property the outside gives it (no value).
struct Binding<'n, 'a> {
    name: &'n str,
    name_span: Span,
    span: Span,
    value: Option<QmlBindingValue<'a>>,
    outer: Option<Outer<'a>>,
}

enum Value<'a> {
    Expression(Expression<'a>),
    Block(ArenaVec<'a, Statement<'a>>),
}

impl<'a> Value<'a> {
    fn into_expression(self, b: B<'a>) -> Expression<'a> {
        match self {
            Value::Expression(expression) => expression,
            Value::Block(statements) => b.call(b.arrow_block(&[], statements), []),
        }
    }

    fn into_thunk(self, b: B<'a>) -> Expression<'a> {
        match self {
            Value::Expression(expression) => b.arrow(&[], expression),
            Value::Block(statements) => b.arrow_block(&[], statements),
        }
    }
}

/// `picked` → `onPicked`.
fn handler_name(signal: &str) -> String {
    let mut name = String::from("on");
    let mut characters = signal.chars();
    name.extend(characters.next().map(|first| first.to_ascii_uppercase()));
    name.push_str(characters.as_str());
    name
}

/// `onClicked`, `onMouseDown`: `on` followed by a capital.
fn is_handler_name(name: &str) -> bool {
    name.strip_prefix("on").is_some_and(|rest| rest.starts_with(|c: char| c.is_ascii_uppercase()))
}

fn unparenthesized<'e, 'a>(expression: &'e Expression<'a>) -> &'e Expression<'a> {
    match expression {
        Expression::ParenthesizedExpression(inner) => unparenthesized(&inner.expression),
        expression => expression,
    }
}

fn as_boolean(expression: &Expression<'_>) -> Option<bool> {
    match unparenthesized(expression) {
        Expression::BooleanLiteral(literal) => Some(literal.value),
        _ => None,
    }
}
