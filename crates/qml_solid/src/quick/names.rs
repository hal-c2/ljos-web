//! Name resolution: QML's context chain, walked when the file is compiled.
//!
//! The lowering leaves authored expressions as they were written. Here every
//! identifier JavaScript scoping leaves free is given the object QML would
//! find it on at run time, in QML's order:
//!
//! 1. the object the expression is written in (`width` → `$3.width`),
//! 2. the root of its component (`hours` → `clock.hours`),
//! 3. what a delegate is given (`index` → `$data.index`),
//! 4. the roots of the components around it, and what those are given,
//! 5. a type the file imports (`ListView.Horizontal`, `ListView.view`),
//! 6. what QML and JavaScript put in every scope.
//!
//! An `id` needs none of this: it is a JavaScript binding of the component
//! function, and JavaScript finds it. Anything else is a compile error
//! rather than an `undefined` at run time.

use std::collections::HashSet;

use oxc_allocator::TakeIn;
use oxc_ast::ast::*;
use oxc_ast_visit::{VisitMut, walk_mut};
use oxc_semantic::SemanticBuilder;
use oxc_span::{GetSpan, Span};
use oxc_syntax::{operator::BinaryOperator, scope::ScopeFlags};

use super::{
    lower::Uses,
    paths,
    scope::Tree,
    texts::{self, Text},
    types::{Kind, Origin, Types},
};
use crate::{Error, build::B, project::Source};

pub(crate) fn resolve<'a>(
    b: B<'a>,
    program: &mut Program<'a>,
    tree: &Tree<'a>,
    types: Types<'_>,
    own: &str,
    dynamic: &HashSet<String>,
    uses: &mut Uses,
    errors: &mut Vec<Error>,
) {
    let free = free_references(program, own);
    let mut resolver = Resolver { b, tree, types, own, dynamic, free, functions: 0, uses, errors };
    resolver.visit_program(program);
    Pruner { used: &resolver.uses.handles }.visit_program(program);
}

/// The authored identifiers no JavaScript binding resolves, by span start.
/// What the lowering built has no span, and its names all have a `$`, which a
/// QML id or property cannot: whatever JavaScript does resolve is an id or a
/// local of the script.
fn free_references(program: &Program<'_>, own: &str) -> HashSet<u32> {
    let semantic = SemanticBuilder::new().with_build_nodes(true).build(program).semantic;
    let scoping = semantic.scoping();
    let mut free = HashSet::new();
    let mut add = |reference| {
        let node = semantic.nodes().get_node(scoping.get_reference(reference).node_id());
        let span = node.kind().span();
        if span.end > span.start {
            free.insert(span.start);
        }
    };
    for references in scoping.root_unresolved_references().values() {
        references.iter().copied().for_each(&mut add);
    }
    // The module binds the file's own name, to the component. To QML a name
    // that is not capitalised is no type: in `mended.qml`, `mended` is the
    // property of that name, if there is one.
    if !own.starts_with(|c: char| c.is_ascii_uppercase())
        && let Some(symbol) = scoping.get_root_binding(own.into())
    {
        scoping.get_resolved_reference_ids(symbol).iter().copied().for_each(&mut add);
    }
    free
}

struct Resolver<'a, 's, 'p> {
    b: B<'a>,
    tree: &'s Tree<'a>,
    types: Types<'p>,
    /// The name of the file's own type. The module binds it, to the
    /// component or to the singleton, so JavaScript finds it; what it is to
    /// QML still has to be asked.
    own: &'s str,
    /// The names the project finds as it runs: see [`Project::dynamic_names`].
    ///
    /// [`Project::dynamic_names`]: crate::project::Project::dynamic_names
    dynamic: &'s HashSet<String>,
    free: HashSet<u32>,
    /// How many functions what is being read is written in: `this` is the
    /// function's own there.
    functions: u32,
    uses: &'s mut Uses,
    errors: &'s mut Vec<Error>,
}

/// What a state changes of a target that is not named by its id is given
/// the target as: [`Tree::aimed`].
pub(crate) const TARGET: &str = "$target";

/// What `Type.name` is.
enum Access {
    /// A member of the type itself: an enum key, a property of a singleton.
    Static,
    /// `Type.Enum`, of `Type.Enum.Key`: the keys are on the type.
    Enum,
    /// A member of the object the type attaches to the one the expression is
    /// written in: `ListView.view`.
    Attached,
    /// A member of the one object a `pragma Singleton` file is.
    Singleton,
}

impl<'a> Resolver<'a, '_, '_> {
    fn is_free(&self, identifier: &IdentifierReference<'a>) -> bool {
        identifier.span.end > identifier.span.start
            && (self.free.contains(&identifier.span.start)
                // An id is never capitalised, so this is the type.
                || (identifier.name == self.own && self.own.starts_with(|c: char| c.is_ascii_uppercase())))
    }

    fn handle(&mut self, object: usize) -> Expression<'a> {
        let handle = self.tree.handle(object);
        self.uses.handles.insert(handle.to_string());
        self.b.id(handle)
    }

    /// The object whose names what is written at `offset` may use as its own.
    fn scope(&mut self, offset: u32) -> Expression<'a> {
        if self.tree.aimed(offset) {
            return self.b.id(TARGET);
        }
        self.handle(self.tree.scope_at(offset))
    }

    /// What reads `name` where it is written; None to leave it as it is.
    /// `written` when it is assigned to: then it has to be one place. What
    /// the name is, is the front end's reading of the file
    /// ([`qml_front::names`]); what JavaScript reads it as is written here.
    fn bare(&mut self, name: &str, span: Span, written: bool) -> Option<Expression<'a>> {
        let b = self.b;
        let tree = self.tree;
        if name.starts_with(|c: char| c.is_ascii_uppercase()) {
            // A singleton by itself is its object.
            let kind = self.type_name(name, span)?;
            return self.types.is_singleton(&kind).then(|| b.call(b.id(name), []));
        }

        let inside = tree.object_at(span.start);
        let names = qml_front::names::Names { tree: &tree.front, types: self.types.front() };
        let resolution = names.lookup(name, span.start);
        let (aimed, roles, target) = match resolution {
            Some(resolution) => {
                if let Some(qml_front::names::Target::Global(global)) = &resolution.target {
                    if *global == qml_front::names::Global::Qml
                        && let Some(global) = QML_GLOBALS.iter().find(|global| **global == name)
                    {
                        self.uses.globals.insert(global);
                    }
                    return None;
                }
                (resolution.aimed.is_some(), resolution.roles, resolution.target)
            }
            None => (false, Vec::new(), None),
        };
        // An id of a component around this one is no binding of the function
        // this is written in: it is found as the program runs, as below. An
        // id of this component is one, and JavaScript had already resolved
        // it wherever the script could see it, so it does not come here.
        let target = target.filter(|target| {
            !matches!(target, qml_front::names::Target::Id(object) if tree.objects[*object].context != tree.objects[inside].context)
        });
        let mut read = target.map(|target| match target {
            qml_front::names::Target::Id(object) => self.handle(object),
            qml_front::names::Target::Property { object, name } => b.member(self.handle(object), &name),
            qml_front::names::Target::Context { context, name } => {
                b.member(b.id(tree.data(context).unwrap_or("$data")), &name)
            }
            // A lowercase name is none of these.
            qml_front::names::Target::Type(_) | qml_front::names::Target::Namespace(_) | qml_front::names::Target::Global(_) => {
                b.id(name)
            }
        });
        if written && read.is_some() && roles.is_empty() {
            return read;
        }
        // `"name" in $data ? $data.name : outer.name`, from the outside in.
        for context in roles.into_iter().rev() {
            let given = tree.data(context).unwrap_or("$data");
            let own = b.member(b.id(given), name);
            read = Some(match read {
                Some(outer) => b.conditional(b.binary(b.string(name), BinaryOperator::In, b.id(given)), own, outer),
                None => own,
            });
        }
        if read.is_none() && self.dynamic.contains(name) {
            // An id of another component: of the one that made this one, if
            // the program is right, which only running it tells.
            let scope = tree.scope_of(inside);
            self.uses.kernel.insert("$lookup");
            read = Some(b.call(b.id("$lookup"), [b.id(&scope), b.string(name)]));
            self.uses.handles.insert(scope);
        }
        if aimed {
            // `"name" in $target ? $target.name : root.name`. A name nothing
            // else has is the target's, or nothing.
            let own = b.member(b.id(TARGET), name);
            return Some(match read {
                Some(outer) => b.conditional(b.binary(b.string(name), BinaryOperator::In, b.id(TARGET)), own, outer),
                None => own,
            });
        }
        if read.is_none() {
            self.errors.push(Error::new(format!("`{name}` is not defined"), span));
        }
        read
    }

    /// A capitalised name: a type, a namespace, or a global.
    fn type_name(&mut self, name: &str, span: Span) -> Option<Kind> {
        if let Some(global) = QML_GLOBALS.iter().find(|global| **global == name) {
            self.uses.globals.insert(global);
            return None;
        }
        if JS_GLOBALS.contains(&name) {
            return None;
        }
        if self.types.namespace(name).is_some() {
            self.uses.namespaces.insert(name.to_string());
            return None;
        }
        match self.types.find(&[name]) {
            Some(found) => {
                self.uses.origin(name, &found.origin);
                Some(found.kind)
            }
            None => {
                self.errors.push(Error::new(format!("`{name}` is not defined"), span));
                None
            }
        }
    }

    fn access(&mut self, name: &str, member: &str, span: Span) -> Access {
        let Some(kind) = self.type_name(name, span) else { return Access::Static };
        self.member_of(&kind, member)
    }

    /// What `member` is to a type, by whatever name the type is found.
    fn member_of(&self, kind: &Kind, member: &str) -> Access {
        match self.types.declared_enum(kind, member) {
            Some(true) => return Access::Enum,
            Some(false) => return Access::Static,
            None => {}
        }
        // The keys of the type a singleton is are on its name, as they are
        // on any component's; everything else of it is on the one object.
        let is_singleton = self.types.is_singleton(kind);
        let rest = if is_singleton { Access::Singleton } else { Access::Static };
        let Some(ty) = self.types.base(kind) else { return rest };
        if ty.0.enum_value(member).is_some() {
            return Access::Static;
        }
        if qml_front::TypeOracle::has_enum(&qml_front::QtTypeOracle, qml_front::QtType(ty.0), member) {
            return Access::Enum;
        }
        if ty.0.attaches(member) && !ty.0.is_singleton && !is_singleton { Access::Attached } else { rest }
    }

    /// `Type.member`, when `expression` is exactly that.
    fn type_member(&mut self, expression: &mut Expression<'a>) -> bool {
        let b = self.b;
        let Expression::StaticMemberExpression(member) = expression else { return false };
        // `Namespace.Type.Enum`, of `Namespace.Type.Enum.Key`: the keys are
        // on the type by whatever name it is found.
        if let Expression::StaticMemberExpression(ty) = &member.object
            && let Expression::Identifier(namespace) = &ty.object
            && self.is_free(namespace)
            && self.types.namespace(namespace.name.as_str()).is_some()
            && let Some(found) = self.types.find(&[namespace.name.as_str(), ty.property.name.as_str()])
            && matches!(self.member_of(&found.kind, member.property.name.as_str()), Access::Enum)
        {
            self.uses.namespaces.insert(namespace.name.to_string());
            *expression = member.object.take_in(&b.allocator());
            return true;
        }
        match self.of_type(member) {
            None => return false,
            Some(Access::Enum) => *expression = member.object.take_in(&b.allocator()),
            Some(_) => {}
        }
        true
    }

    /// `Type.member`, read or written: of the one object a singleton is, or
    /// of what the type attaches to the object the script is written in.
    /// None when it is no member of a type.
    fn of_type(&mut self, member: &mut StaticMemberExpression<'a>) -> Option<Access> {
        let b = self.b;
        let Expression::Identifier(object) = &member.object else { return None };
        let name = object.name.as_str();
        if !self.is_free(object) || !name.starts_with(|c: char| c.is_ascii_uppercase()) {
            return None;
        }
        let span = object.span;
        let access = self.access(name, member.property.name.as_str(), span);
        match access {
            Access::Static | Access::Enum => {}
            Access::Singleton => member.object = b.call(b.id(name), []),
            Access::Attached => {
                let attachee = self.scope(span.start);
                member.object = b.call(b.member(b.id(name), "attached"), [attachee]);
            }
        }
        Some(access)
    }
}

/// Where the type of `object.Type` is named from.
enum Attaching {
    /// `Namespace.Type`: attached to the object the expression is written in.
    Here(String),
    /// `object.Namespace.Type`.
    Through(String),
    /// `object.Type`.
    Object,
}

impl<'a> Resolver<'a, '_, '_> {
    /// `object.Type.member`: a member of what the type attaches to that
    /// object, and no property of it (`delegate.ListView.isCurrentItem`).
    /// `Namespace.Type.member` is of what it attaches to the object the
    /// expression is written in, and `object.Namespace.Type.member` of what
    /// it attaches to the object.
    fn attached_member(&mut self, member: &mut StaticMemberExpression<'a>) -> bool {
        let span = member.span;
        let wanted = member.property.name.to_string();
        let Expression::StaticMemberExpression(inner) = &mut member.object else { return false };
        let Some(attached) = self.attachment(inner, Some(&wanted), span) else { return false };
        member.object = attached;
        true
    }

    /// `object.Type`, held as a value (`const said = item.SplitView`): what
    /// the type attaches to the object. `Namespace.Type` is the type.
    fn attached_object(&mut self, expression: &mut Expression<'a>) -> bool {
        let Expression::StaticMemberExpression(member) = expression else { return false };
        let span = member.span;
        let Some(attached) = self.attachment(member, None, span) else { return false };
        *expression = attached;
        true
    }

    /// `Type.attached(object)` for `object.Type`, if the type attaches
    /// `wanted`, or anything at all when nothing is asked of it.
    fn attachment(
        &mut self,
        inner: &mut StaticMemberExpression<'a>,
        wanted: Option<&str>,
        span: Span,
    ) -> Option<Expression<'a>> {
        let b = self.b;
        let name = inner.property.name.to_string();
        if !name.starts_with(|c: char| c.is_ascii_uppercase()) {
            return None;
        }
        // A type of a namespace is the type, wherever the namespace is named:
        // what the compiler wrote names it too.
        if wanted.is_none()
            && let Expression::Identifier(object) = &inner.object
            && self.types.namespace(object.name.as_str()).is_some()
        {
            return None;
        }
        // `Type.Enum.Key`: a key that has the name of a type is still a key.
        if self.is_enum(&inner.object) {
            return None;
        }
        let of = match &inner.object {
            Expression::Identifier(object) if self.is_free(object) && object.name.starts_with(|c: char| c.is_ascii_uppercase()) => {
                // `Qt.Window`, `Text.Text`: a member of a type or a global.
                self.types.namespace(object.name.as_str())?;
                Attaching::Here(object.name.to_string())
            }
            Expression::StaticMemberExpression(outer) if self.types.namespace(outer.property.name.as_str()).is_some() => {
                Attaching::Through(outer.property.name.to_string())
            }
            _ => Attaching::Object,
        };
        let namespace = match &of {
            Attaching::Here(namespace) | Attaching::Through(namespace) => Some(namespace.as_str()),
            Attaching::Object => None,
        };
        let path: Vec<&str> = namespace.into_iter().chain([name.as_str()]).collect();
        let found = self.types.find(&path)?;
        let ty = self.types.base(&found.kind)?;
        if ty.0.is_singleton {
            return None;
        }
        match wanted {
            Some(wanted) if !ty.0.attaches(wanted) => return None,
            None if ty.0.attached().is_none() || matches!(of, Attaching::Here(_)) => return None,
            _ => {}
        }
        Some(match of {
            Attaching::Here(namespace) => {
                let ty = b.member(b.id(&namespace), &name);
                self.uses.namespaces.insert(namespace);
                let attachee = self.scope(span.start);
                b.call(b.member(ty, "attached"), [attachee])
            }
            Attaching::Through(namespace) => {
                let ty = b.member(b.id(&namespace), &name);
                self.uses.namespaces.insert(namespace);
                let Expression::StaticMemberExpression(outer) = &mut inner.object else { unreachable!() };
                let mut attachee = outer.object.take_in(&b.allocator());
                self.visit_expression(&mut attachee);
                b.call(b.member(ty, "attached"), [attachee])
            }
            Attaching::Object => {
                self.uses.origin(&name, &found.origin);
                let mut attachee = inner.object.take_in(&b.allocator());
                self.visit_expression(&mut attachee);
                b.call(b.member(b.id(&name), "attached"), [attachee])
            }
        })
    }

    /// Whether `expression` is `Type.Enum` or `Namespace.Type.Enum`: an enum
    /// of a type, by the type's name.
    fn is_enum(&self, expression: &Expression<'a>) -> bool {
        let Expression::StaticMemberExpression(member) = expression else { return false };
        let found = match &member.object {
            Expression::Identifier(ty) if self.is_free(ty) => self.types.find(&[ty.name.as_str()]),
            Expression::StaticMemberExpression(ty) => match &ty.object {
                Expression::Identifier(namespace) if self.is_free(namespace) => {
                    self.types.namespace(namespace.name.as_str()).and_then(|_| self.types.find(&[namespace.name.as_str(), ty.property.name.as_str()]))
                }
                _ => None,
            },
            _ => None,
        };
        found.is_some_and(|found| matches!(self.member_of(&found.kind, member.property.name.as_str()), Access::Enum))
    }

    /// `Qt.createQmlObject("import QtQuick; Item {}", parent)`: the object of
    /// the component the text is, which [`texts`] makes of it. True when
    /// `expression` became that.
    fn text_object(&mut self, expression: &mut Expression<'a>) -> bool {
        let Expression::CallExpression(call) = expression else { return false };
        let Some(first) = texts::given(call) else { return false };
        let Some((source, holes)) = texts::written(first) else { return false };
        let index = self.uses.texts.len();
        let span = first.span();
        self.uses.texts.push(Text { source, span, holes });
        let b = self.b;
        let mut arguments = std::mem::replace(&mut call.arguments, b.vec()).into_iter();
        let mut put = Vec::new();
        if let Some(first) = arguments.next() {
            texts::put(first.into_expression(), &mut put);
        }
        let made = if put.is_empty() { b.id(&texts::name(index)) } else { b.call(b.id(&texts::name(index)), put) };
        // Its object finds names where the text is written.
        let scope = (!self.dynamic.is_empty()).then(|| self.tree.scope_of(self.tree.object_at(span.start)));
        let context = scope.as_deref().map(|scope| b.id(scope));
        self.uses.handles.extend(scope);
        self.uses.kernel.insert("$file");
        let create = b.member(b.call(b.id("$file"), std::iter::once(made).chain(context)), "createObject");
        *expression = b.call(create, arguments.next().map(Argument::into_expression));
        true
    }

    /// `Qt.createComponent("QtQuick3D", "TextureInput")`: a type of a module
    /// as a component. The module has it whether the file imports it or not.
    fn module_component(&mut self, expression: &Expression<'a>) -> Option<Expression<'a>> {
        let Expression::CallExpression(call) = expression else { return None };
        if paths::qt_method(call) != Some("createComponent") {
            return None;
        }
        let [Argument::StringLiteral(uri), Argument::StringLiteral(name), ..] = call.arguments.as_slice() else {
            return None;
        };
        let (uri, name) = (uri.value.as_str(), name.value.as_str());
        let origin = match self.types.project.module_type(uri, name) {
            Some(file) => Origin::File(file.to_string()),
            None => {
                qt_types::module(uri)?.type_named(name)?;
                Origin::Module(uri.to_string())
            }
        };
        self.uses.origin(name, &origin);
        self.uses.kernel.insert("$file");
        Some(self.b.call(self.b.id("$file"), [self.b.id(name)]))
    }
}


impl<'a> VisitMut<'a> for Resolver<'a, '_, '_> {
    fn visit_expression(&mut self, expression: &mut Expression<'a>) {
        // The scripts are parsed as TypeScript so that QML's type annotations
        // parse; none of it is meant to reach the output.
        loop {
            let inner = match expression {
                Expression::TSAsExpression(it) => it.expression.take_in(&self.b.allocator()),
                Expression::TSSatisfiesExpression(it) => it.expression.take_in(&self.b.allocator()),
                Expression::TSNonNullExpression(it) => it.expression.take_in(&self.b.allocator()),
                Expression::TSTypeAssertion(it) => it.expression.take_in(&self.b.allocator()),
                _ => break,
            };
            *expression = inner;
        }

        // What a file named by its path makes finds names where the path is
        // written, if the project finds any as it runs.
        let scope = (!self.dynamic.is_empty() && !expression.span().is_empty())
            .then(|| self.tree.scope_of(self.tree.object_at(expression.span().start)));
        if let Some(component) = self.module_component(expression) {
            *expression = component;
            return;
        }
        if self.text_object(expression) {
            walk_mut::walk_expression(self, expression);
            return;
        }
        let Uses { paths, kernel, handles, .. } = &mut *self.uses;
        if paths.rewrite(self.b, kernel, expression, scope.as_deref())
            && let Some(scope) = scope
        {
            handles.insert(scope);
        }
        if let Expression::StaticMemberExpression(member) = expression
            && self.attached_member(member)
        {
            return;
        }
        if self.type_member(expression) || self.attached_object(expression) {
            return;
        }
        match expression {
            Expression::Identifier(identifier) if self.is_free(identifier) => {
                let (name, span) = (identifier.name.as_str(), identifier.span);
                if let Some(read) = self.bare(name, span, false) {
                    *expression = read;
                }
            }
            // In a binding or a handler `this` is the object it is written
            // on, and what a state changes when it is written in one.
            Expression::ThisExpression(this) if self.functions == 0 && !this.span.is_empty() => {
                *expression = self.scope(this.span.start);
            }
            _ => walk_mut::walk_expression(self, expression),
        }
    }

    /// `hours = 5`, `count++`: the property is written where it is read.
    fn visit_simple_assignment_target(&mut self, target: &mut SimpleAssignmentTarget<'a>) {
        if let SimpleAssignmentTarget::AssignmentTargetIdentifier(identifier) = target
            && self.is_free(identifier)
        {
            let (name, span) = (identifier.name.as_str(), identifier.span);
            match self.bare(name, span, true) {
                Some(Expression::StaticMemberExpression(member)) => {
                    *target = SimpleAssignmentTarget::StaticMemberExpression(member);
                }
                Some(_) => self.errors.push(Error::new(format!("`{name}` cannot be assigned to"), span)),
                None => {}
            }
            return;
        }
        // `ToolTip.visible = true` is told to what the type attaches, as
        // `ToolTip.visible` is read from it.
        if let SimpleAssignmentTarget::StaticMemberExpression(member) = target
            && (self.attached_member(member) || self.of_type(member).is_some())
        {
            return;
        }
        walk_mut::walk_simple_assignment_target(self, target);
    }

    /// `{ "Page.qml": 1 }`: a key is a name, whatever it looks like.
    fn visit_property_key(&mut self, key: &mut PropertyKey<'a>) {
        if !matches!(key, PropertyKey::StringLiteral(_)) {
            walk_mut::walk_property_key(self, key);
        }
    }

    fn visit_object_property(&mut self, property: &mut ObjectProperty<'a>) {
        walk_mut::walk_object_property(self, property);
        if property.shorthand {
            let same = match (&property.key, &property.value) {
                (PropertyKey::StaticIdentifier(key), Expression::Identifier(value)) => key.name == value.name,
                _ => false,
            };
            property.shorthand = same;
        }
    }

    fn visit_formal_parameter(&mut self, parameter: &mut FormalParameter<'a>) {
        parameter.type_annotation = None;
        walk_mut::walk_formal_parameter(self, parameter);
    }

    fn visit_function(&mut self, function: &mut Function<'a>, flags: ScopeFlags) {
        function.return_type = None;
        function.type_parameters = None;
        // One that was written, and not the component's own.
        let written = u32::from(!function.span.is_empty());
        self.functions += written;
        walk_mut::walk_function(self, function, flags);
        self.functions -= written;
    }

    fn visit_arrow_function_expression(&mut self, arrow: &mut ArrowFunctionExpression<'a>) {
        arrow.return_type = None;
        arrow.type_parameters = None;
        walk_mut::walk_arrow_function_expression(self, arrow);
    }

    fn visit_variable_declarator(&mut self, declarator: &mut VariableDeclarator<'a>) {
        declarator.type_annotation = None;
        walk_mut::walk_variable_declarator(self, declarator);
    }
}

/// Takes out the bindings of the objects nothing names.
struct Pruner<'s> {
    used: &'s HashSet<String>,
}

impl Pruner<'_> {
    /// `$7`: a name the analysis gave an object that has no id. `$scope`: a
    /// context nothing looks anything up in.
    fn is_unused(&self, name: &str) -> bool {
        let ours = name.strip_prefix('$').is_some_and(|rest| {
            let rest = rest.strip_prefix("scope").unwrap_or(rest);
            rest.bytes().all(|byte| byte.is_ascii_digit()) && name.len() > 1
        });
        ours && !self.used.contains(name)
    }
}

impl<'a> VisitMut<'a> for Pruner<'_> {
    fn visit_statements(&mut self, statements: &mut oxc_allocator::ArenaVec<'a, Statement<'a>>) {
        statements.retain(|statement| {
            let Statement::VariableDeclaration(declaration) = statement else { return true };
            let [declarator] = declaration.declarations.as_slice() else { return true };
            let BindingPattern::BindingIdentifier(identifier) = &declarator.id else { return true };
            !(declarator.span.is_empty() && self.is_unused(identifier.name.as_str()))
        });
        walk_mut::walk_statements(self, statements);
    }

    fn visit_jsx_opening_element(&mut self, element: &mut JSXOpeningElement<'a>) {
        element.attributes.retain(|attribute| {
            let JSXAttributeItem::Attribute(attribute) = attribute else { return true };
            let JSXAttributeName::Identifier(name) = &attribute.name else { return true };
            if name.name != "$self" {
                return true;
            }
            let Some(JSXAttributeValue::ExpressionContainer(container)) = &attribute.value else { return true };
            let JSXExpression::Identifier(identifier) = &container.expression else { return true };
            !self.is_unused(identifier.name.as_str())
        });
        walk_mut::walk_jsx_opening_element(self, element);
    }
}

pub(crate) use qml_front::names::{JS_GLOBALS, QML_GLOBALS};

/// What `import "lib.js" as Lib` or `import QtQuick.Controls as C` is to the
/// module: a namespace import of `source`, under `prefix` for a Qt module.
pub(crate) fn namespace_source(source: &Source, prefix: &str) -> Option<String> {
    match source {
        Source::Module(uri) => Some(format!("{prefix}/{}", uri.replace('.', "/"))),
        Source::Path(path) if path.ends_with(".js") || path.ends_with(".mjs") => {
            Some(if path.starts_with("./") || path.starts_with("../") || path.starts_with('/') {
                path.clone()
            } else {
                format!("./{path}")
            })
        }
        Source::Path(_) => None,
    }
}
