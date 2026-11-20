//! What Solid's DOM compiler makes of an `<input>` whose `type` is bound
//! beside its value.

use solidjs_compiler::{CompileOptions, compile};

/// What the compiler makes of `source`.
fn compiled(source: &str, hydratable: bool) -> String {
    let options = CompileOptions {
        hydratable,
        ..CompileOptions::default()
    };
    compile(source, &options).expect("compile JSX").code
}

/// The body of the one effect that writes the element's bindings.
fn effect(source: &str, hydratable: bool) -> String {
    let code = compiled(source, hydratable);
    let start = code.find("_p$) => {").expect("one effect for the bindings");
    code[start..].to_string()
}

/// A nullish value clears a text field to "" but removes a checkbox's
/// `value`, so the checked box submits "on" (solid#4017). `setProperty`
/// reads the live `type` to tell, so a type bound in the same effect is
/// written first, and a change of type alone writes the value again. The
/// bindings are still read in the order written, since reading one may
/// change what another reads.
#[test]
fn a_bound_type_is_written_before_the_value_and_a_new_type_writes_it_again() {
    for hydratable in [false, true] {
        for (source, guard) in [
            (
                "const v = <input type={kind()} defaultValue={initial()} />;",
                r#"(t !== _p$?.t || e !== _p$?.e) && _$setProperty(_el$, "defaultValue", t)"#,
            ),
            (
                "const v = <input defaultValue={initial()} type={kind()} />;",
                r#"(e !== _p$?.e || t !== _p$?.t) && _$setProperty(_el$, "defaultValue", e)"#,
            ),
        ] {
            let code = compiled(source, hydratable);
            let read = |call: &str| {
                code.find(call)
                    .unwrap_or_else(|| panic!("{call} in\n{code}"))
            };
            let first = if source.find("kind()") < source.find("initial()") {
                ("kind()", "initial()")
            } else {
                ("initial()", "kind()")
            };
            assert!(
                read(first.0) < read(first.1),
                "read in the order written: {source}\n{code}"
            );
            let body = effect(source, hydratable);
            let at = |write: &str| {
                body.find(write)
                    .unwrap_or_else(|| panic!("{write} in\n{body}"))
            };
            assert!(
                at(r#"(_el$, "type""#) < at(r#"(_el$, "defaultValue""#),
                "the type first: {source}\n{body}"
            );
            assert!(
                body.contains(guard),
                "the value again when the type changes: {source}\n{body}"
            );
        }
        let body = effect(
            "const v = <input value={initial()} type={kind()} />;",
            hydratable,
        );
        let at = |write: &str| {
            body.find(write)
                .unwrap_or_else(|| panic!("{write} in\n{body}"))
        };
        assert!(at(r#"(_el$, "type""#) < at(r#"(_el$, "value""#), "{body}");
        assert!(
            body.contains("(e !== _p$?.e || t !== _p$?.t || !a) &&"),
            "{body}"
        );
    }
}

/// Only an input's own type does it: another input's, or a type written
/// as text, leaves the value's write as it was.
#[test]
fn a_value_without_its_own_bound_type_is_written_when_it_changes() {
    let body = effect(
        "const v = <div><input defaultValue={initial()} /><input type={kind()} title={label()} /></div>;",
        false,
    );
    assert!(!body.contains("||"), "{body}");
    let body = effect(
        r#"const v = <input type="checkbox" defaultValue={initial()} title={label()} />;"#,
        false,
    );
    assert!(
        body.contains(r#"e !== _p$?.e && _$setProperty(_el$, "defaultValue", e)"#),
        "{body}"
    );
}

/// Solid 2 reserves no namespace but `prop:`, so `class:type` and
/// `style:type` are attributes of those whole names, not the input's type:
/// the value is written where it was, when it changes. `prop:type` is the
/// type.
#[test]
fn only_type_or_prop_type_is_the_inputs_type() {
    for (source, write) in [
        (
            "const v = <input defaultValue={initial()} class:type={on()} />;",
            r#""class:type""#,
        ),
        (
            "const v = <input defaultValue={initial()} style:type={look()} />;",
            r#""style:type""#,
        ),
    ] {
        let body = effect(source, false);
        let at = |write: &str| {
            body.find(write)
                .unwrap_or_else(|| panic!("{write} in\n{body}"))
        };
        assert!(!body.contains("||"), "{source}\n{body}");
        assert!(at(r#""defaultValue""#) < at(write), "{source}\n{body}");
    }
    let source = "const v = <input defaultValue={initial()} prop:type={kind()} />;";
    let body = effect(source, false);
    let at = |write: &str| {
        body.find(write)
            .unwrap_or_else(|| panic!("{write} in\n{body}"))
    };
    assert!(
        at("_el$.type = t") < at(r#"(_el$, "defaultValue""#),
        "{source}\n{body}"
    );
    assert!(
        body.contains(
            r#"(e !== _p$?.e || t !== _p$?.t) && _$setProperty(_el$, "defaultValue", e)"#
        ),
        "{source}\n{body}"
    );
}
