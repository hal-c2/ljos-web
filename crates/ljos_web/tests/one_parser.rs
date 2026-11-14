//! The compiler's wasm links one JS parser. ljos_web and the vendored
//! solidjs-compiler each name Ljós's oxc_parser fork by git rev; if one rev is
//! bumped without the other, or a crate pulls the published oxc_parser back
//! in, the build still succeeds and the wasm silently grows by ~283 KB.

#[test]
fn the_lockfile_holds_one_oxc_parser() {
    let lock = include_str!("../../../Cargo.lock");
    let names: Vec<&str> = lock
        .lines()
        .filter_map(|line| line.strip_prefix("name = \""))
        .filter_map(|rest| rest.strip_suffix('"'))
        .filter(|name| *name == "oxc_parser" || *name == "ljos_oxc_parser")
        .collect();
    assert_eq!(
        names,
        ["ljos_oxc_parser"],
        "Cargo.lock must hold exactly one oxc parser, Ljós's fork at one rev: \
         keep the rev in crates/ljos_web/Cargo.toml and \
         vendor/solidjs-compiler/Cargo.toml equal"
    );
}
