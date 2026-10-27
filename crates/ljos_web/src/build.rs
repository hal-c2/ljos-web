//! Construction vocabulary for the nodes the lowering synthesizes.
//!
//! Everything built here carries an empty span, which is how the rest of the
//! pipeline tells synthesized structure from authored QML leaves (the same
//! convention Solid's TSRX front end uses).

use oxc_allocator::{Allocator, ArenaBox, ArenaVec};
use oxc_ast::{ast::*, builder::AstBuilder};
use oxc_span::{SPAN, SourceType};
use oxc_str::{Ident, Str};
use oxc_syntax::{
    number::NumberBase,
    operator::{BinaryOperator, LogicalOperator, UnaryOperator},
};

#[derive(Clone, Copy)]
pub(crate) struct B<'a> {
    allocator: &'a Allocator,
}

impl<'a> B<'a> {
    pub(crate) fn new(allocator: &'a Allocator) -> Self {
        Self { allocator }
    }

    pub(crate) fn allocator(&self) -> &'a Allocator {
        self.allocator
    }

    fn ast(&self) -> AstBuilder<'a> {
        AstBuilder::new(self.allocator)
    }

    pub(crate) fn vec<T>(&self) -> ArenaVec<'a, T> {
        ArenaVec::new_in(&self.ast())
    }

    pub(crate) fn vec1<T>(&self, value: T) -> ArenaVec<'a, T> {
        ArenaVec::from_value_in(value, &self.ast())
    }

    pub(crate) fn ident(&self, value: &str) -> Ident<'a> {
        Ident::from_str_in(value, &self.ast())
    }

    pub(crate) fn str(&self, value: &str) -> Str<'a> {
        Str::from_str_in(value, &self.ast())
    }

    // Expressions

    pub(crate) fn id(&self, name: &str) -> Expression<'a> {
        Expression::new_identifier(SPAN, self.ident(name), &self.ast())
    }

    pub(crate) fn string(&self, value: &str) -> Expression<'a> {
        Expression::new_string_literal(SPAN, self.str(value), None, &self.ast())
    }

    pub(crate) fn number(&self, value: f64) -> Expression<'a> {
        Expression::new_numeric_literal(SPAN, value, None, NumberBase::Decimal, &self.ast())
    }

    pub(crate) fn boolean(&self, value: bool) -> Expression<'a> {
        Expression::new_boolean_literal(SPAN, value, &self.ast())
    }

    pub(crate) fn null(&self) -> Expression<'a> {
        Expression::new_null_literal(SPAN, &self.ast())
    }

    pub(crate) fn void_0(&self) -> Expression<'a> {
        Expression::new_unary_expression(SPAN, UnaryOperator::Void, self.number(0.0), &self.ast())
    }

    pub(crate) fn member(&self, object: Expression<'a>, property: &str) -> Expression<'a> {
        Expression::StaticMemberExpression(StaticMemberExpression::boxed(
            SPAN,
            object,
            IdentifierName::new(SPAN, self.ident(property), &self.ast()),
            false,
            &self.ast(),
        ))
    }

    pub(crate) fn call(
        &self,
        callee: Expression<'a>,
        arguments: impl IntoIterator<Item = Expression<'a>>,
    ) -> Expression<'a> {
        let arguments =
            ArenaVec::from_iter_in(arguments.into_iter().map(Argument::from), &self.ast());
        Expression::new_call_expression(SPAN, callee, None, arguments, false, &self.ast())
    }

    /// `callee?.(...rest)`
    pub(crate) fn optional_call_spread(&self, callee: Expression<'a>, rest: &str) -> Expression<'a> {
        let call = CallExpression::boxed(SPAN, callee, None, self.spread(rest), true, &self.ast());
        Expression::new_chain_expression(SPAN, ChainElement::CallExpression(call), &self.ast())
    }

    /// `callee(...rest)`
    pub(crate) fn call_spread(&self, callee: Expression<'a>, rest: &str) -> Expression<'a> {
        Expression::new_call_expression(SPAN, callee, None, self.spread(rest), false, &self.ast())
    }

    fn spread(&self, rest: &str) -> ArenaVec<'a, Argument<'a>> {
        self.vec1(Argument::new_spread_element(SPAN, self.id(rest), &self.ast()))
    }

    pub(crate) fn binary(
        &self,
        left: Expression<'a>,
        operator: BinaryOperator,
        right: Expression<'a>,
    ) -> Expression<'a> {
        Expression::new_binary_expression(SPAN, left, operator, right, &self.ast())
    }

    pub(crate) fn conditional(
        &self,
        test: Expression<'a>,
        consequent: Expression<'a>,
        alternate: Expression<'a>,
    ) -> Expression<'a> {
        Expression::new_conditional_expression(SPAN, test, consequent, alternate, &self.ast())
    }

    /// `left ?? right`
    pub(crate) fn coalesce(&self, left: Expression<'a>, right: Expression<'a>) -> Expression<'a> {
        Expression::new_logical_expression(SPAN, left, LogicalOperator::Coalesce, right, &self.ast())
    }

    /// `new callee(arguments)`
    pub(crate) fn new_(
        &self,
        callee: Expression<'a>,
        arguments: impl IntoIterator<Item = Expression<'a>>,
    ) -> Expression<'a> {
        let arguments =
            ArenaVec::from_iter_in(arguments.into_iter().map(Argument::from), &self.ast());
        Expression::new_new_expression(SPAN, callee, None, arguments, &self.ast())
    }

    /// `import.meta.url`
    pub(crate) fn import_meta_url(&self) -> Expression<'a> {
        let meta = Expression::new_import_meta(SPAN, &self.ast());
        self.member(meta, "url")
    }

    /// `[elements]`
    pub(crate) fn array(&self, elements: impl IntoIterator<Item = Expression<'a>>) -> Expression<'a> {
        let elements = ArenaVec::from_iter_in(
            elements.into_iter().map(ArrayExpressionElement::from),
            &self.ast(),
        );
        Expression::new_array_expression(SPAN, elements, &self.ast())
    }

    /// `{ key: value, ... }`, the keys built here.
    pub(crate) fn record(
        &self,
        entries: impl IntoIterator<Item = (String, Expression<'a>)>,
    ) -> Expression<'a> {
        let properties = ArenaVec::from_iter_in(
            entries.into_iter().map(|(key, value)| {
                ObjectPropertyKind::new_object_property(
                    SPAN,
                    PropertyKind::Init,
                    PropertyKey::StaticIdentifier(IdentifierName::boxed(
                        SPAN,
                        self.ident(&key),
                        &self.ast(),
                    )),
                    value,
                    false,
                    false,
                    false,
                    &self.ast(),
                )
            }),
            &self.ast(),
        );
        Expression::new_object_expression(SPAN, properties, &self.ast())
    }

    /// `(() => { statements })()`
    pub(crate) fn iife(&self, statements: ArenaVec<'a, Statement<'a>>) -> Expression<'a> {
        self.call(self.arrow_block(&[], statements), [])
    }

    /// `{ "key": value, ... }`
    pub(crate) fn object(
        &self,
        entries: impl IntoIterator<Item = (&'a str, Expression<'a>)>,
    ) -> Expression<'a> {
        let properties = ArenaVec::from_iter_in(
            entries.into_iter().map(|(key, value)| {
                ObjectPropertyKind::new_object_property(
                    SPAN,
                    PropertyKind::Init,
                    PropertyKey::StringLiteral(StringLiteral::boxed(
                        SPAN,
                        self.str(key),
                        None,
                        &self.ast(),
                    )),
                    value,
                    false,
                    false,
                    false,
                    &self.ast(),
                )
            }),
            &self.ast(),
        );
        Expression::new_object_expression(SPAN, properties, &self.ast())
    }

    fn params(&self, names: &[&str]) -> ArenaBox<'a, FormalParameters<'a>> {
        let items = ArenaVec::from_iter_in(
            names.iter().map(|name| {
                FormalParameter::new(
                    SPAN,
                    self.vec(),
                    BindingPattern::new_binding_identifier(SPAN, self.ident(name), &self.ast()),
                    None,
                    None,
                    false,
                    None,
                    false,
                    false,
                    &self.ast(),
                )
            }),
            &self.ast(),
        );
        FormalParameters::boxed(
            SPAN,
            FormalParameterKind::ArrowFormalParameters,
            items,
            None,
            &self.ast(),
        )
    }

    /// `(params) => expression`
    pub(crate) fn arrow(&self, params: &[&str], expression: Expression<'a>) -> Expression<'a> {
        Expression::new_arrow_function_expression(
            SPAN,
            false,
            None,
            self.params(params),
            None,
            ArrowFunctionBody::from(expression),
            &self.ast(),
        )
    }

    /// `(params) => { statements }`
    pub(crate) fn arrow_block(
        &self,
        params: &[&str],
        statements: ArenaVec<'a, Statement<'a>>,
    ) -> Expression<'a> {
        Expression::new_arrow_function_expression(
            SPAN,
            false,
            None,
            self.params(params),
            None,
            ArrowFunctionBody::FunctionBody(FunctionBody::boxed(
                SPAN,
                self.vec(),
                statements,
                &self.ast(),
            )),
            &self.ast(),
        )
    }

    /// `(...rest) => { statements }`
    pub(crate) fn arrow_rest_block(
        &self,
        rest: &str,
        statements: ArenaVec<'a, Statement<'a>>,
    ) -> Expression<'a> {
        let mut params = self.params(&[]);
        params.rest = Some(FormalParameterRest::boxed(
            SPAN,
            self.vec(),
            BindingRestElement::new(
                SPAN,
                BindingPattern::new_binding_identifier(SPAN, self.ident(rest), &self.ast()),
                &self.ast(),
            ),
            None,
            &self.ast(),
        ));
        Expression::new_arrow_function_expression(
            SPAN,
            false,
            None,
            params,
            None,
            ArrowFunctionBody::FunctionBody(FunctionBody::boxed(
                SPAN,
                self.vec(),
                statements,
                &self.ast(),
            )),
            &self.ast(),
        )
    }

    // Statements

    pub(crate) fn statement(&self, expression: Expression<'a>) -> Statement<'a> {
        Statement::new_expression_statement(SPAN, expression, &self.ast())
    }

    pub(crate) fn return_(&self, argument: Expression<'a>) -> Statement<'a> {
        Statement::new_return_statement(SPAN, Some(argument), &self.ast())
    }

    /// What a script is worth is what its last statement is: `if (a) { b }
    /// else { c }` returns `b` or `c`.
    pub(crate) fn returning(&self, statement: &mut Statement<'a>) {
        match statement {
            Statement::ExpressionStatement(_) => {
                let empty = Statement::new_empty_statement(SPAN, &self.ast());
                if let Statement::ExpressionStatement(taken) = std::mem::replace(statement, empty) {
                    *statement = self.return_(taken.unbox().expression);
                }
            }
            Statement::BlockStatement(block) => {
                if let Some(last) = block.body.last_mut() {
                    self.returning(last);
                }
            }
            Statement::IfStatement(branch) => {
                self.returning(&mut branch.consequent);
                if let Some(alternate) = &mut branch.alternate {
                    self.returning(alternate);
                }
            }
            Statement::TryStatement(tried) => {
                if let Some(last) = tried.block.body.last_mut() {
                    self.returning(last);
                }
                if let Some(last) = tried.handler.as_mut().and_then(|handler| handler.body.body.last_mut()) {
                    self.returning(last);
                }
            }
            Statement::SwitchStatement(switch) => {
                for case in &mut switch.cases {
                    // `case 1: a; break;` is worth `a`.
                    if matches!(case.consequent.last(), Some(Statement::BreakStatement(_)))
                        && case.consequent.len() > 1
                    {
                        case.consequent.pop();
                    }
                    if let Some(last) = case.consequent.last_mut() {
                        self.returning(last);
                    }
                }
            }
            _ => {}
        }
    }

    fn const_pattern(&self, pattern: BindingPattern<'a>, init: Expression<'a>) -> Statement<'a> {
        let declarator = VariableDeclarator::new(SPAN, pattern, None, Some(init), false, &self.ast());
        Statement::VariableDeclaration(VariableDeclaration::boxed(
            SPAN,
            VariableDeclarationKind::Const,
            self.vec1(declarator),
            false,
            &self.ast(),
        ))
    }

    /// `const name = init;`
    pub(crate) fn const_(&self, name: &str, init: Expression<'a>) -> Statement<'a> {
        self.const_pattern(
            BindingPattern::new_binding_identifier(SPAN, self.ident(name), &self.ast()),
            init,
        )
    }

    /// `const [first, second] = init;`
    pub(crate) fn const_pair(
        &self,
        first: &str,
        second: &str,
        init: Expression<'a>,
    ) -> Statement<'a> {
        let elements = ArenaVec::from_iter_in(
            [first, second].into_iter().map(|name| {
                Some(BindingPattern::new_binding_identifier(SPAN, self.ident(name), &self.ast()))
            }),
            &self.ast(),
        );
        self.const_pattern(BindingPattern::new_array_pattern(SPAN, elements, None, &self.ast()), init)
    }

    fn function(
        &self,
        name: &str,
        params: &[&str],
        statements: ArenaVec<'a, Statement<'a>>,
    ) -> ArenaBox<'a, Function<'a>> {
        let mut params = self.params(params);
        params.kind = FormalParameterKind::FormalParameter;
        Function::boxed(
            SPAN,
            FunctionType::FunctionDeclaration,
            Some(BindingIdentifier::new(SPAN, self.ident(name), &self.ast())),
            false,
            false,
            false,
            None,
            None,
            params,
            None,
            Some(FunctionBody::boxed(SPAN, self.vec(), statements, &self.ast())),
            &self.ast(),
        )
    }

    /// `function name(params) { statements }`
    pub(crate) fn function_declaration(
        &self,
        name: &str,
        params: &[&str],
        statements: ArenaVec<'a, Statement<'a>>,
    ) -> Statement<'a> {
        Statement::FunctionDeclaration(self.function(name, params, statements))
    }

    /// `export default function name(params) { statements }`
    pub(crate) fn export_default_function(
        &self,
        name: &str,
        params: &[&str],
        statements: ArenaVec<'a, Statement<'a>>,
    ) -> Statement<'a> {
        Statement::ExportDefaultDeclaration(ExportDefaultDeclaration::boxed(
            SPAN,
            ExportDefaultDeclarationKind::FunctionDeclaration(self.function(name, params, statements)),
            &self.ast(),
        ))
    }

    /// `export declaration`
    pub(crate) fn export(&self, declaration: Declaration<'a>) -> Statement<'a> {
        Statement::ExportDeclaration(ExportDeclaration::boxed(SPAN, declaration, &self.ast()))
    }

    /// `export default expression;`
    pub(crate) fn export_default(&self, expression: Expression<'a>) -> Statement<'a> {
        Statement::ExportDefaultDeclaration(ExportDefaultDeclaration::boxed(
            SPAN,
            ExportDefaultDeclarationKind::from(expression),
            &self.ast(),
        ))
    }

    fn import(
        &self,
        specifiers: ArenaVec<'a, ImportDeclarationSpecifier<'a>>,
        source: &str,
    ) -> Statement<'a> {
        Statement::ImportDeclaration(ImportDeclaration::boxed(
            SPAN,
            Some(specifiers),
            StringLiteral::new(SPAN, self.str(source), None, &self.ast()),
            None,
            None,
            ImportOrExportKind::Value,
            &self.ast(),
        ))
    }

    /// `import { a, b } from "source";`
    pub(crate) fn import_named<'n>(
        &self,
        names: impl IntoIterator<Item = &'n str>,
        source: &str,
    ) -> Statement<'a> {
        let specifiers = ArenaVec::from_iter_in(
            names.into_iter().map(|name| {
                ImportDeclarationSpecifier::new_import_specifier(
                    SPAN,
                    ModuleExportName::new_identifier_name(SPAN, self.ident(name), &self.ast()),
                    BindingIdentifier::new(SPAN, self.ident(name), &self.ast()),
                    ImportOrExportKind::Value,
                    &self.ast(),
                )
            }),
            &self.ast(),
        );
        self.import(specifiers, source)
    }

    /// `import * as name from "source";`
    pub(crate) fn import_namespace(&self, name: &str, source: &str) -> Statement<'a> {
        let specifier = ImportDeclarationSpecifier::new_import_namespace_specifier(
            SPAN,
            BindingIdentifier::new(SPAN, self.ident(name), &self.ast()),
            &self.ast(),
        );
        self.import(self.vec1(specifier), source)
    }

    /// `import name from "source";`
    pub(crate) fn import_default(&self, name: &str, source: &str) -> Statement<'a> {
        let specifier = ImportDeclarationSpecifier::new_import_default_specifier(
            SPAN,
            BindingIdentifier::new(SPAN, self.ident(name), &self.ast()),
            &self.ast(),
        );
        self.import(self.vec1(specifier), source)
    }

    pub(crate) fn program(
        &self,
        source: &'a str,
        body: ArenaVec<'a, Statement<'a>>,
    ) -> Program<'a> {
        Program::new(
            SPAN,
            SourceType::jsx().with_module(true),
            source,
            self.vec(),
            None,
            self.vec(),
            body,
            &self.ast(),
        )
    }

    // JSX

    fn jsx_name(&self, name: &str) -> JSXAttributeName<'a> {
        JSXAttributeName::Identifier(JSXIdentifier::boxed(SPAN, self.str(name), &self.ast()))
    }

    /// `name={expression}`
    pub(crate) fn attr(&self, name: &str, expression: Expression<'a>) -> JSXAttributeItem<'a> {
        JSXAttributeItem::Attribute(JSXAttribute::boxed(
            SPAN,
            self.jsx_name(name),
            Some(JSXAttributeValue::ExpressionContainer(JSXExpressionContainer::boxed(
                SPAN,
                expression.into(),
                &self.ast(),
            ))),
            &self.ast(),
        ))
    }

    /// `name="value"`
    pub(crate) fn attr_string(&self, name: &str, value: &str) -> JSXAttributeItem<'a> {
        JSXAttributeItem::Attribute(JSXAttribute::boxed(
            SPAN,
            self.jsx_name(name),
            Some(JSXAttributeValue::StringLiteral(StringLiteral::boxed(
                SPAN,
                self.str(value),
                None,
                &self.ast(),
            ))),
            &self.ast(),
        ))
    }

    /// `{expression}` in child position.
    pub(crate) fn child(&self, expression: Expression<'a>) -> JSXChild<'a> {
        match expression {
            Expression::JSXElement(element) => JSXChild::Element(element),
            expression => JSXChild::new_expression_container(SPAN, expression.into(), &self.ast()),
        }
    }

    /// `<name attributes>children</name>`. A lowercase name is a DOM tag, any
    /// other name a reference to a component in scope, `Space.Name` one to a
    /// member of a namespace in scope.
    pub(crate) fn element(
        &self,
        name: &str,
        attributes: ArenaVec<'a, JSXAttributeItem<'a>>,
        children: ArenaVec<'a, JSXChild<'a>>,
    ) -> Expression<'a> {
        let element_name = || {
            if name.starts_with(|c: char| c.is_ascii_lowercase()) {
                JSXElementName::Identifier(JSXIdentifier::boxed(SPAN, self.str(name), &self.ast()))
            } else if let Some((space, member)) = name.split_once('.') {
                JSXElementName::MemberExpression(JSXMemberExpression::boxed(
                    SPAN,
                    JSXMemberExpressionObject::IdentifierReference(IdentifierReference::boxed(
                        SPAN,
                        self.ident(space),
                        &self.ast(),
                    )),
                    JSXIdentifier::new(SPAN, self.str(member), &self.ast()),
                    &self.ast(),
                ))
            } else {
                JSXElementName::IdentifierReference(IdentifierReference::boxed(
                    SPAN,
                    self.ident(name),
                    &self.ast(),
                ))
            }
        };
        Expression::JSXElement(JSXElement::boxed(
            SPAN,
            JSXOpeningElement::boxed(SPAN, element_name(), None, attributes, &self.ast()),
            children,
            Some(JSXClosingElement::boxed(SPAN, element_name(), &self.ast())),
            &self.ast(),
        ))
    }
}
