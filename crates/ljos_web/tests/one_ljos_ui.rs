//! ljos-web takes ljos-ui at one commit. Each re-pin moves the crates its
//! change needs, so a pin it does not touch stays where it was and the build
//! still succeeds: from 5f74fc9e on, the kernel's `ljos_reactive`, both wasm
//! examples and the copied Quick3D QML stayed 1636 commits behind the rest.
//! A pin that falls behind is caught here instead.

/// Every place that names a commit of ljos-ui. The manifests are read as
/// well as the lockfile, so a pin left behind is named where it is written.
/// The examples are workspaces of their own (their lockfiles are not kept),
/// so only their manifests are.
const PINNED: [(&str, &str); 12] = [
    ("Cargo.lock", include_str!("../../../Cargo.lock")),
    ("crates/ljos_web/Cargo.toml", include_str!("../Cargo.toml")),
    (
        "crates/ljos_web_3d/Cargo.toml",
        include_str!("../../ljos_web_3d/Cargo.toml"),
    ),
    (
        "crates/ljos_web_kernel/Cargo.toml",
        include_str!("../../ljos_web_kernel/Cargo.toml"),
    ),
    (
        "vendor/solidjs-compiler/Cargo.toml",
        include_str!("../../../vendor/solidjs-compiler/Cargo.toml"),
    ),
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
    // The design's three lines that name the pin, each read on its own, so
    // one left behind, or reworded so it is no longer found, is named.
    ("docs/LJOS_WEB.md (A22)", DESIGN),
    ("docs/LJOS_WEB.md (A31)", DESIGN),
    ("docs/LJOS_WEB.md (A34)", DESIGN),
];

const DESIGN: &str = include_str!("../../../docs/LJOS_WEB.md");

/// Stands for a dependency on ljos-ui that names no commit: it follows a
/// branch, so it is a pin of its own and never agrees with the others.
const NO_REV: &str = "(no rev)";

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
    } else if file.ends_with("(A22)") {
        // The kernel's graph follows the pin.
        commit_after(text, "follows ljos-ui (rev ")
    } else if file.ends_with("(A31)") {
        // Both compilers take the Ljós dialect at the pin.
        commit_after(text, "at the ljos-ui pin (`")
    } else if file.ends_with("(A34)") {
        // Ljós's own controls are copied at the pin.
        commit_after(text, "the commit the compiler is pinned to\n(`")
    } else {
        declarations(text)
            .into_iter()
            .flat_map(|declared| match commit_after(declared, "rev = \"") {
                found if found.is_empty() => vec![NO_REV],
                found => found,
            })
            .collect()
    }
}

const LJOS_UI: &str = "hal-c2/ljos-ui.git";

/// Each dependency on ljos-ui a manifest declares, whole, so its `git` and
/// its `rev` are read together: an inline table is its line, and a table of
/// its own (`[dependencies.name]`) runs from its header to the next.
fn declarations(text: &str) -> Vec<&str> {
    let mut tables = Vec::new();
    let (mut from, mut at) = (0, 0);
    for line in text.split_inclusive('\n') {
        if line.trim_start().starts_with('[') && at > from {
            tables.push(&text[from..at]);
            from = at;
        }
        at += line.len();
    }
    tables.push(&text[from..]);
    tables
        .into_iter()
        .flat_map(|table| {
            let own = table.lines().any(|line| {
                line.trim_start().strip_prefix("git").is_some_and(|rest| {
                    rest.trim_start().starts_with('=') && rest.contains(LJOS_UI)
                })
            });
            if own {
                vec![table]
            } else {
                table
                    .lines()
                    .filter(|line| line.contains(LJOS_UI))
                    .collect()
            }
        })
        .collect()
}

#[test]
fn a_dependency_in_a_table_of_its_own_is_read_with_its_rev() {
    // The examples keep no lockfile, so in them only the manifest can tell
    // a stale table: an inline dependency at the pin must not hide it.
    let manifest = "[dependencies]\n\
        ljos_ir = { git = \"ssh://git@github.com/hal-c2/ljos-ui.git\", rev = \"18f6d6eca7929e8e6c4dd0722c242533bac4b2d4\" }\n\
        \n\
        [dependencies.qml_front]\n\
        git = \"ssh://git@github.com/hal-c2/ljos-ui.git\"\n\
        rev = \"09ce2bacd77607c852519c34e914f8e6a8bf1dd6\"\n\
        \n\
        [dependencies.ljos_core]\n\
        git = \"ssh://git@github.com/hal-c2/ljos-ui.git\"\n\
        default-features = false\n";
    assert_eq!(
        revs("examples/x/Cargo.toml", manifest),
        [
            "18f6d6eca7929e8e6c4dd0722c242533bac4b2d4",
            "09ce2bacd77607c852519c34e914f8e6a8bf1dd6",
            NO_REV,
        ]
    );
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
