//! The message macros of `Ljos.Core` (`` t`Hello ${name}` ``, `msg`,
//! `plural`, `select`, `selectOrdinal`), lowered where they are written to
//! the runtime's calls that look the message up as the program runs:
//!
//! ```js
//! __ljos_message("Hello {name}", "", "Hello {name}", "name", name)
//! ```
//!
//! The message, its context, the key a catalogue holds it by and its
//! placeholders' names are read as the file is compiled
//! ([`crate::message`], ljos-ui's reader), so the same message gives the
//! same key and the same text here as it does in native Ljós. The values
//! are passed in the order the names are, each expression as it was
//! written.

use oxc_allocator::TakeIn;
use oxc_ast::ast::Expression;
use oxc_ast_visit::{VisitMut, walk_mut};
use oxc_span::{GetSpan, Span};

use crate::{
    Error,
    build::B,
    message::{MacroKind, MessageCall, MessageError, MessageErrorKind},
};

/// What a message's macro is lowered to: the function of `Ljos.Core` that
/// looks it up, and the values' expressions, taken out of `expression`, for
/// the caller to resolve as it resolves any other. `None` for `t(m)`, which
/// stays a call of `t`.
pub(crate) fn take<'a>(
    b: B<'a>,
    call: &MessageCall,
    expression: &mut Expression<'a>,
) -> Option<(&'static str, Vec<Expression<'a>>)> {
    if call.given.is_some() {
        return None;
    }
    let mut take = Take {
        b,
        spans: call.placeholders.iter().map(|p| p.span).collect(),
        found: call.placeholders.iter().map(|_| None).collect(),
    };
    take.visit_expression(expression);
    let function = if call.kind == MacroKind::Msg {
        "__ljos_msg"
    } else {
        "__ljos_message"
    };
    let values = take
        .found
        .into_iter()
        .map(|found| found.unwrap_or_else(|| b.id("undefined")))
        .collect();
    Some((function, values))
}

/// `function(message, context, key, "a,b", a, b)`.
pub(crate) fn lowered<'a>(
    b: B<'a>,
    call: &MessageCall,
    function: &str,
    values: Vec<Expression<'a>>,
) -> Expression<'a> {
    let names: Vec<&str> = call.placeholders.iter().map(|p| p.name.as_str()).collect();
    let mut arguments = vec![
        b.string(call.message.as_deref().unwrap_or_default()),
        b.string(call.context.as_deref().unwrap_or_default()),
        b.string(call.key().unwrap_or_default()),
        b.string(&names.join(",")),
    ];
    arguments.extend(values);
    b.call(b.id(function), arguments)
}

/// What is said of a macro that says no message, with ljos-ui's codes.
pub(crate) fn error(error: MessageError, span: Span) -> Error {
    match error.kind {
        MessageErrorKind::Literal => Error::coded(error.message, span, "i18n-literal"),
        MessageErrorKind::Other => Error::coded(error.message, span, "i18n-other"),
        MessageErrorKind::Shape => Error::new(error.message, span),
    }
}

/// Takes the expressions of a message's values out of the macro written
/// around them, by where each is written.
struct Take<'a> {
    b: B<'a>,
    spans: Vec<Span>,
    found: Vec<Option<Expression<'a>>>,
}

impl<'a> VisitMut<'a> for Take<'a> {
    fn visit_expression(&mut self, expression: &mut Expression<'a>) {
        let span = expression.span();
        if let Some(at) = self
            .spans
            .iter()
            .zip(&self.found)
            .position(|(wanted, found)| *wanted == span && found.is_none())
        {
            self.found[at] = Some(expression.take_in(&self.b.allocator()));
            return;
        }
        walk_mut::walk_expression(self, expression);
    }
}
