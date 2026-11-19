//! What Solid's DOM compiler makes of an `<input>` whose `type` is bound
//! beside its value.

use solidjs_compiler::{CompileOptions, compile};

/// The body of the one effect that writes the element's bindings.
fn effect(source: &str, hydratable: bool) -> String {
    let options = CompileOptions {
        hydratable,
        ..CompileOptions::default()
    };
    let code = compile(source, &options).expect("compile JSX").code;
    let start = code.find("_p$) => {").expect("one effect for the bindings");
    code[start..].to_string()
}

/// A nullish value clears a text field to "" but removes a checkbox's
/// `value`, so the checked box submits "on" (solid#4017). `setProperty`
/// reads the live `type` to tell, so a type bound in the same effect is
/// written first, and a change of type alone writes the value again.
#[test]
fn a_bound_type_is_written_before_the_value_and_a_new_type_writes_it_again() {
    for hydratable in [false, true] {
        for source in [
            "const v = <input type={kind()} defaultValue={initial()} />;",
            "const v = <input defaultValue={initial()} type={kind()} />;",
        ] {
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
                body.contains(
                    r#"(t !== _p$?.t || e !== _p$?.e) && _$setProperty(_el$, "defaultValue", t)"#
                ),
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
            body.contains("(t !== _p$?.t || e !== _p$?.e || !a) &&"),
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
