//! Name resolution: QML's context chain, decided at compile time.
//!
//! The lowering leaves authored expressions untouched. Here every identifier
//! JavaScript scoping leaves free is resolved the way QML would resolve it at
//! run time, in a fixed order, and rewritten to the binding that carries it:
//!
//! 1. an `id` (`panel.input` → `panel$input()`),
//! 2. a member of the object the expression belongs to,
//! 3. a member of the component's root object, then of the components around it
//!    (with `modelData` and `index` where a delegate provides them),
//! 4. a singleton or namespace of the host module (capitalised),
//! 5. a JavaScript global.
//!
//! Anything else is a compile error rather than an `undefined` at run time.
//! Reads of reactive members come out as calls, which is exactly what Solid's
//! classifier needs to see to treat the surrounding expression as dynamic.

use std::collections::{BTreeSet, HashSet};

use oxc_allocator::TakeIn;
use oxc_ast::ast::*;
use oxc_ast_visit::{VisitMut, walk_mut};
use oxc_semantic::SemanticBuilder;
use oxc_span::{GetSpan, Span};
use oxc_syntax::scope::ScopeFlags;

use crate::{
    Error,
    build::B,
    registry::Types,
    scope::{Member, Provided, Scopes},
};

pub(crate) struct Resolved {
    /// Names to import from the host module.
    pub host: BTreeSet<String>,
    /// The QML globals used, which the runtime module exports.
    pub runtime: BTreeSet<&'static str>,
}

pub(crate) fn resolve<'a>(
    b: B<'a>,
    program: &mut Program<'a>,
    scopes: &Scopes<'a>,
    types: Types,
    errors: &mut Vec<Error>,
) -> Resolved {
    let free = free_references(program);
    let mut resolver =
        Resolver { b, scopes, types, free, errors, host: BTreeSet::new(), runtime: BTreeSet::new() };
    resolver.visit_program(program);
    Resolved { host: resolver.host, runtime: resolver.runtime }
}

/// The authored identifiers no JavaScript binding resolves, by span start.
/// Generated bindings all contain a `$`, which a QML id or property name
/// cannot, so whatever JavaScript does resolve is a local of the script.
fn free_references(program: &Program<'_>) -> HashSet<u32> {
    let semantic = SemanticBuilder::new().with_build_nodes(true).build(program).semantic;
    let scoping = semantic.scoping();
    let mut free = HashSet::new();
    for references in scoping.root_unresolved_references().values() {
        for &reference in references {
            let node = semantic.nodes().get_node(scoping.get_reference(reference).node_id());
            let span = node.kind().span();
            if span.end > span.start {
                free.insert(span.start);
            }
        }
    }
    free
}

enum Resolution {
    Member(Member),
    Provided(Provided),
    /// Left as written: a global or an import.
    Global,
    /// Reported; leave the node alone.
    Failed,
}

struct Resolver<'a, 's> {
    b: B<'a>,
    scopes: &'s Scopes<'a>,
    types: Types,
    free: HashSet<u32>,
    errors: &'s mut Vec<Error>,
    host: BTreeSet<String>,
    runtime: BTreeSet<&'static str>,
}

impl<'a> Resolver<'a, '_> {
    fn is_free(&self, identifier: &IdentifierReference<'a>) -> bool {
        identifier.span.end > identifier.span.start && self.free.contains(&identifier.span.start)
    }

    fn fail(&mut self, message: String, span: Span) -> Resolution {
        self.errors.push(Error::new(message, span));
        Resolution::Failed
    }

    fn bare(&mut self, name: &str, span: Span) -> Resolution {
        let scopes = self.scopes;
        let object = scopes.object_at(span.start);
        if scopes.id(object, name).is_some() {
            return self.fail(
                format!("`{name}` is an object; passing objects around is not supported yet"),
                span,
            );
        }
        if let Some(member) = scopes.member(object, name) {
            return Resolution::Member(member.clone());
        }
        let mut root = Some(scopes.objects[object].component_root);
        while let Some(index) = root {
            if index != object
                && let Some(member) = scopes.member(index, name)
            {
                return Resolution::Member(member.clone());
            }
            if let Some(delegate) = scopes.objects[index].delegate {
                match name {
                    "modelData" => return Resolution::Provided(delegate.model_data),
                    "index" => return Resolution::Provided(delegate.index),
                    _ => {}
                }
            }
            root = scopes.objects[index].outer;
        }

        if let Some(global) = QML_GLOBALS.iter().find(|global| **global == name) {
            self.runtime.insert(global);
            return Resolution::Global;
        }
        if JS_GLOBALS.contains(&name) {
            return Resolution::Global;
        }
        if name.starts_with(|c: char| c.is_ascii_uppercase()) {
            self.host.insert(name.to_string());
            return Resolution::Global;
        }
        let type_name = scopes.objects[object].type_name;
        let built_in =
            self.types.element(type_name).is_some_and(|element| element.prop(name).is_some());
        if built_in {
            self.fail(
                format!("reading the built-in property `{name}` of `{type_name}` is not supported yet"),
                span,
            )
        } else {
            self.fail(format!("`{name}` is not defined"), span)
        }
    }

    fn through_id(&mut self, id: &str, property: &str, span: Span) -> Resolution {
        let from = self.scopes.object_at(span.start);
        let Some(object) = self.scopes.id(from, id) else {
            return self.fail(format!("`{id}` is not defined"), span);
        };
        match self.scopes.member(object, property) {
            Some(member) => Resolution::Member(member.clone()),
            None => self.fail(
                format!(
                    "`{id}.{property}`: only declared properties and functions can be reached through an id yet"
                ),
                span,
            ),
        }
    }

    /// The expression that reads what a name resolved to.
    fn read(&mut self, resolution: Resolution, span: Span) -> Option<Expression<'a>> {
        let b = self.b;
        match resolution {
            Resolution::Member(Member::Const(js) | Member::Function(js)) => Some(b.id(&js)),
            Resolution::Member(Member::Getter(js) | Member::Memo(js)) => {
                Some(b.call(b.id(&js), []))
            }
            Resolution::Member(Member::Signal { get, .. }) => Some(b.call(b.id(&get), [])),
            Resolution::Member(Member::Unsupported(what)) => {
                self.errors.push(Error::new(format!("{what} are not supported yet"), span));
                None
            }
            Resolution::Provided(provided) => Some(if provided.accessor {
                b.call(b.id(provided.js), [])
            } else {
                b.id(provided.js)
            }),
            Resolution::Global | Resolution::Failed => None,
        }
    }

    /// `id.property`, when `expression` is exactly that.
    fn id_member(&self, expression: &Expression<'a>) -> Option<(&'a str, &'a str, Span)> {
        let Expression::StaticMemberExpression(member) = expression else { return None };
        self.id_member_parts(member)
    }

    fn id_member_parts(
        &self,
        member: &StaticMemberExpression<'a>,
    ) -> Option<(&'a str, &'a str, Span)> {
        let Expression::Identifier(object) = &member.object else { return None };
        let from = self.scopes.object_at(object.span.start);
        if !self.is_free(object) || self.scopes.id(from, object.name.as_str()).is_none() {
            return None;
        }
        Some((object.name.as_str(), member.property.name.as_str(), member.span))
    }

    /// What an assignment writes to, if it is a QML member.
    fn assignment_target(&mut self, target: &AssignmentTarget<'a>) -> Option<(Resolution, Span)> {
        match target {
            AssignmentTarget::AssignmentTargetIdentifier(identifier) if self.is_free(identifier) => {
                Some((self.bare(identifier.name.as_str(), identifier.span), identifier.span))
            }
            AssignmentTarget::StaticMemberExpression(member) => {
                let (id, property, span) = self.id_member_parts(member)?;
                Some((self.through_id(id, property, span), span))
            }
            _ => None,
        }
    }

    /// `property = value` → `set$property(value)`. Solid's setter treats a
    /// function argument as an updater, so anything that is not plainly a
    /// value goes in as one: `set(() => value)`.
    fn assignment(&mut self, expression: &mut Expression<'a>) -> bool {
        let b = self.b;
        let Expression::AssignmentExpression(assignment) = expression else { return false };
        let Some((resolution, span)) = self.assignment_target(&assignment.left) else {
            return false;
        };
        let (get, set) = match resolution {
            Resolution::Member(Member::Signal { get, set }) => (get, set),
            Resolution::Failed => return true,
            Resolution::Member(Member::Unsupported(what)) => {
                self.errors.push(Error::new(format!("{what} are not supported yet"), span));
                return true;
            }
            _ => {
                self.errors.push(Error::new("cannot assign to a read-only name".to_string(), span));
                return true;
            }
        };
        self.visit_expression(&mut assignment.right);
        let right = assignment.right.take_in(&b.allocator());
        let value = match assignment.operator.to_binary_operator() {
            _ if assignment.operator.is_assign() => right,
            Some(operator) => b.binary(b.call(b.id(&get), []), operator, right),
            None => {
                self.errors.push(Error::new(
                    "logical assignment to a property is not supported yet".to_string(),
                    span,
                ));
                return true;
            }
        };
        let argument = if is_plain_value(&value) { value } else { b.arrow(&[], value) };
        *expression = b.call(b.id(&set), [argument]);
        true
    }
}

fn is_plain_value(expression: &Expression<'_>) -> bool {
    matches!(
        expression,
        Expression::NumericLiteral(_)
            | Expression::StringLiteral(_)
            | Expression::BooleanLiteral(_)
            | Expression::NullLiteral(_)
            | Expression::TemplateLiteral(_)
            | Expression::ObjectExpression(_)
            | Expression::ArrayExpression(_)
    )
}

impl<'a> VisitMut<'a> for Resolver<'a, '_> {
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

        if let Some((id, property, span)) = self.id_member(expression) {
            let resolution = self.through_id(id, property, span);
            if let Some(read) = self.read(resolution, span) {
                *expression = read;
            }
            return;
        }
        match expression {
            Expression::Identifier(identifier) if self.is_free(identifier) => {
                let (name, span) = (identifier.name.as_str(), identifier.span);
                let resolution = self.bare(name, span);
                if let Some(read) = self.read(resolution, span) {
                    *expression = read;
                }
            }
            Expression::AssignmentExpression(_) => {
                if !self.assignment(expression) {
                    walk_mut::walk_expression(self, expression);
                }
            }
            Expression::UpdateExpression(update) => {
                let target = match &update.argument {
                    SimpleAssignmentTarget::AssignmentTargetIdentifier(identifier)
                        if self.is_free(identifier) =>
                    {
                        Some(identifier.span)
                    }
                    SimpleAssignmentTarget::StaticMemberExpression(member) => {
                        self.id_member_parts(member).map(|(_, _, span)| span)
                    }
                    _ => None,
                };
                match target {
                    Some(span) => self.errors.push(Error::new(
                        "`++` and `--` on a property are not supported yet".to_string(),
                        span,
                    )),
                    None => walk_mut::walk_expression(self, expression),
                }
            }
            _ => walk_mut::walk_expression(self, expression),
        }
    }

    fn visit_object_property(&mut self, property: &mut ObjectProperty<'a>) {
        walk_mut::walk_object_property(self, property);
        if property.shorthand {
            let same = match (&property.key, &property.value) {
                (PropertyKey::StaticIdentifier(key), Expression::Identifier(value)) => {
                    key.name == value.name
                }
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
        walk_mut::walk_function(self, function, flags);
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

/// What QML puts in every script's scope, whatever is imported.
const QML_GLOBALS: &[&str] = &["Qt", "qsTr"];

const JS_GLOBALS: &[&str] = &[
    "undefined",
    "NaN",
    "Infinity",
    "globalThis",
    "console",
    "arguments",
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "encodeURI",
    "encodeURIComponent",
    "decodeURI",
    "decodeURIComponent",
    "Math",
    "JSON",
    "Object",
    "Array",
    "String",
    "Number",
    "Boolean",
    "Symbol",
    "BigInt",
    "Date",
    "RegExp",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Promise",
    "Error",
    "TypeError",
    "RangeError",
    "Intl",
];
