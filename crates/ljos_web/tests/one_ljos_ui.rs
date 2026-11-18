//! ljos-web takes ljos-ui at one commit. Each re-pin moves the crates its
//! change needs, so a pin it does not touch stays where it was and the build
//! still succeeds: from 5f74fc9e on, the kernel's `ljos_reactive`, both wasm
//! examples and the copied Quick3D QML stayed 1636 commits behind the rest.
//! A pin that falls behind is caught here instead.

/// Every place that names a commit of ljos-ui. The examples are workspaces
/// of their own (their lockfiles are not kept), so their manifests are read.
const PINNED: [(&str, &str); 6] = [
    ("Cargo.lock", include_str!("../../../Cargo.lock")),
    (
        "examples/wasm-counter/Cargo.toml",
        include_str!("../../../examples/wasm-counter/Cargo.toml"),
    ),
    (
        "examples/wasm-gauge/Cargo.toml",
        include_str!("../../../examples/wasm-gauge/Cargo.toml"),
    ),
    (
        "packages/runtime/controls/LJOS_UI.json",
        include_str!("../../../packages/runtime/controls/LJOS_UI.json"),
    ),
    (
        "packages/runtime/quick3d/LJOS_UI.json",
        include_str!("../../../packages/runtime/quick3d/LJOS_UI.json"),
    ),
    (
        "docs/LJOS_WEB.md (A22)",
        include_str!("../../../docs/LJOS_WEB.md"),
    ),
];

/// The commit (whole or short) written right after each `marker` in `text`.
fn commit_after<'a>(text: &'a str, marker: &str) -> Vec<&'a str> {
    text.match_indices(marker)
        .map(|(at, _)| {
            let rest = &text[at + marker.len()..];
            let end = rest
                .find(|c: char| !c.is_ascii_hexdigit())
                .unwrap_or(rest.len());
            &rest[..end]
        })
        .filter(|rev| rev.len() >= 7)
        .collect()
}

fn revs<'a>(file: &str, text: &'a str) -> Vec<&'a str> {
    if file.ends_with(".json") {
        commit_after(text, "\"rev\": \"")
    } else if file == "Cargo.lock" {
        commit_after(text, "hal-c2/ljos-ui.git?rev=")
    } else if file.starts_with("docs/") {
        // The kernel's section says which commit its graph follows.
        commit_after(text, "follows ljos-ui (rev ")
    } else {
        text.lines()
            .filter(|line| line.contains("hal-c2/ljos-ui.git"))
            .flat_map(|line| commit_after(line, "rev = \""))
            .collect()
    }
}

#[test]
fn ljos_ui_is_pinned_at_one_commit_everywhere() {
    // Each commit found, whole where one place writes it whole, with where.
    let mut pins: Vec<(String, Vec<&str>)> = Vec::new();
    for (file, text) in PINNED {
        let found = revs(file, text);
        assert!(!found.is_empty(), "{file} names no commit of ljos-ui");
        for rev in found {
            match pins
                .iter_mut()
                .find(|(pin, _)| pin.starts_with(rev) || rev.starts_with(pin.as_str()))
            {
                Some((pin, files)) => {
                    if rev.len() > pin.len() {
                        *pin = rev.to_owned();
                    }
                    if !files.contains(&file) {
                        files.push(file);
                    }
                }
                None => pins.push((rev.to_owned(), vec![file])),
            }
        }
    }
    let listed: Vec<String> = pins
        .iter()
        .map(|(pin, files)| format!("{pin}: {}", files.join(", ")))
        .collect();
    assert_eq!(
        pins.len(),
        1,
        "ljos-ui is pinned at more than one commit; move every pin together \
         (crates/*/Cargo.toml, vendor/solidjs-compiler, the examples, both LJOS_UI.json, \
         docs/LJOS_WEB.md, then Cargo.lock):\n  {}",
        listed.join("\n  ")
    );
}
