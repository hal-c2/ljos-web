//! The theme file as `docs/theme.md` in ljos-ui has it: which file is read,
//! what is refused, and the overrides a page applies.

use std::process::Command;

use ljos_web::theme::{self, ThemeError};

fn messages(errors: &[ThemeError]) -> Vec<String> {
    errors.iter().map(ToString::to_string).collect()
}

fn refused(text: &str) -> Vec<String> {
    messages(&theme::check("theme.json", text, None).expect_err("the theme is refused"))
}

#[test]
fn the_theme_nearest_the_entry_wins() {
    let files = ["theme.json", "app/theme.json", "app/pages/Main.qml"];
    let has = |name: &str| files.contains(&name);
    assert_eq!(theme::nearest("app/pages", "", has).as_deref(), Some("app/theme.json"));
    assert_eq!(theme::nearest("app", "", has).as_deref(), Some("app/theme.json"));
    assert_eq!(theme::nearest("", "", has).as_deref(), Some("theme.json"));
    assert_eq!(theme::nearest("other", "", has).as_deref(), Some("theme.json"));
}

#[test]
fn nothing_above_the_project_is_read() {
    let files = ["theme.json"];
    let has = |name: &str| files.contains(&name);
    assert_eq!(theme::nearest("app/pages", "app", has), None);
    // An entry outside the project is looked for beside alone.
    assert_eq!(theme::nearest("lib", "app", has), None);
    assert_eq!(theme::nearest("lib", "app", |name: &str| name == "lib/theme.json").as_deref(), Some("lib/theme.json"));
}

#[test]
fn the_search_over_given_names_is_the_search_over_the_disk() {
    let base = std::env::temp_dir().join(format!("ljos-web-theme-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    for dir in ["p/app/pages", "p/lib"] {
        std::fs::create_dir_all(base.join(dir)).unwrap();
    }
    let layouts: [&[&str]; 4] = [
        &["theme.json", "p/theme.json", "p/app/theme.json"],
        &["theme.json", "p/theme.json"],
        &["theme.json"],
        &["p/lib/theme.json", "p/app/pages/theme.json"],
    ];
    for files in layouts {
        for file in ["theme.json", "p/theme.json", "p/app/theme.json", "p/lib/theme.json", "p/app/pages/theme.json"] {
            let _ = std::fs::remove_file(base.join(file));
        }
        for file in files {
            std::fs::write(base.join(file), "{}").unwrap();
        }
        for (entry, project) in
            [("p/app/pages", "p"), ("p/app/pages", "p/app"), ("p/lib", "p/app"), ("p", "p"), ("p/app", "p/app/pages")]
        {
            let on_disk = ljos_design::theme::find(&base.join(entry), &base.join(project));
            let given = theme::nearest(entry, project, |name: &str| files.contains(&name));
            assert_eq!(
                on_disk.map(|path| path.strip_prefix(&base).unwrap().to_string_lossy().replace('\\', "/")),
                given,
                "{entry} in {project} with {files:?}"
            );
        }
    }
    std::fs::remove_dir_all(&base).unwrap();
}

#[test]
fn a_checked_theme_is_its_overrides() {
    let text = r##"{
  "Colors": { "seedHue": 280, "accent": { "light": "#6a1b9a", "darkHigh": "plum" }, "scrim": "#80000000" },
  "Spacing": { "md": 20 },
  "Motion": { "press": 90, "easeOut": [0.2, 0, 0, 1, 1, 1], "enterScale": 0.5 }
}"##;
    let checked = theme::check("app/theme.json", text, None).expect("the theme is taken");
    assert_eq!(
        theme::json(&checked),
        concat!(
            r##"{"file":"app/theme.json","overrides":["##,
            r##"{"singleton":"Colors","role":"seedHue","value":280},"##,
            r##"{"singleton":"Colors","role":"accent","variants":{"light":"#6a1b9a","darkHigh":"#dda0dd"}},"##,
            r##"{"singleton":"Colors","role":"scrim","variants":{"light":"#80000000","dark":"#80000000"}},"##,
            r##"{"singleton":"Spacing","role":"md","value":20},"##,
            r##"{"singleton":"Motion","role":"press","value":90},"##,
            r##"{"singleton":"Motion","role":"easeOut","value":[0.2,0,0,1,1,1]},"##,
            r##"{"singleton":"Motion","role":"enterScale","value":0.5}"##,
            "]}"
        )
    );
}

#[test]
fn an_empty_theme_overrides_nothing() {
    let checked = theme::check("theme.json", "{}", None).unwrap();
    assert_eq!(theme::json(&checked), r#"{"file":"theme.json","overrides":[]}"#);
}

#[test]
fn json_that_cannot_be_read_is_refused() {
    let told = refused("{\n  \"Spacing\": { \"md\": 20 \n}");
    assert_eq!(told.len(), 1, "{told:?}");
    assert!(told[0].starts_with("theme.json:"), "{told:?}");
}

#[test]
fn a_key_given_twice_is_refused() {
    let told = refused("{\n  \"Spacing\": { \"md\": 20, \"md\": 24 }\n}");
    assert_eq!(told.len(), 1, "{told:?}");
    assert!(told[0].starts_with("theme.json:2:"), "{told:?}");
}

#[test]
fn a_singleton_the_module_does_not_have_is_refused() {
    let told = refused("{\n  \"colors\": {}\n}");
    assert_eq!(told.len(), 1, "{told:?}");
    assert!(told[0].starts_with("theme.json:2:3: "), "{told:?}");
}

#[test]
fn a_role_the_module_does_not_have_is_refused() {
    assert_eq!(
        refused("{\n  \"Colors\": { \"acent\": \"#6a1b9a\" }\n}"),
        ["theme.json:2:15: Colors has no role \"acent\""]
    );
}

#[test]
fn a_value_of_the_wrong_kind_or_out_of_range_is_refused() {
    let told = refused("{\n  \"Colors\": { \"accent\": 3 },\n  \"Spacing\": { \"md\": -4 }\n}");
    assert_eq!(told.len(), 2, "{told:?}");
    assert!(told[0].starts_with("theme.json:2:") && told[0].contains("Colors.accent is a colour"), "{told:?}");
    assert!(told[1].starts_with("theme.json:3:") && told[1].contains("Spacing.md"), "{told:?}");
}

#[test]
fn the_users_settings_are_not_the_themes_to_set() {
    let told = refused(
        "{\n  \"Colors\": { \"dark\": true, \"highContrast\": true, \"table\": [], \"roles\": [] },\n  \"Motion\": { \"reduced\": true }\n}",
    );
    assert_eq!(told.len(), 5, "{told:?}");
    assert!(told.iter().all(|line| line.starts_with("theme.json:")), "{told:?}");
}

#[test]
fn a_colour_that_breaks_the_palettes_contrast_is_refused() {
    let told = refused("{\n  \"Colors\": {\n    \"text\": \"#bbbbbb\"\n  }\n}");
    assert!(!told.is_empty());
    assert!(told.iter().all(|line| line.starts_with("theme.json:3:")), "{told:?}");
    assert!(told[0].contains("Colors.text on canvas is"), "{told:?}");
}

#[test]
fn a_ground_must_be_opaque() {
    let told = refused("{\n  \"Colors\": { \"canvas\": \"#80ffffff\" }\n}");
    assert!(!told.is_empty());
    assert!(told.iter().all(|line| line.starts_with("theme.json:2:")), "{told:?}");
}

#[test]
fn the_contrast_is_held_at_the_seed_hue_the_page_shows() {
    // The palette a muted text is read on is made from the hue, so the same
    // colour measures differently at another.
    let text = r##"{ "Colors": { "textMuted": "#777777" } }"##;
    let at = |hue| messages(&theme::check("theme.json", text, Some(hue)).unwrap_err());
    assert_ne!(at(0.0), at(240.0));
    // The theme's own hue wins over the one it is checked with.
    let own = r##"{ "Colors": { "seedHue": 0, "textMuted": "#777777" } }"##;
    let with_own = |hue| messages(&theme::check("theme.json", own, Some(hue)).unwrap_err());
    assert_eq!(with_own(240.0), with_own(0.0));
    // Where it is told differs, the colour now later on the line; what is not.
    let said = |lines: Vec<String>| {
        lines.into_iter().map(|line| line.splitn(4, ':').nth(3).unwrap().to_owned()).collect::<Vec<_>>()
    };
    assert_eq!(said(with_own(240.0)), said(at(0.0)));
}

fn qmlc() -> Command {
    Command::new(env!("CARGO_BIN_EXE_qmlc"))
}

fn scratch(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("ljos-web-qmlc-theme-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("app/pages")).unwrap();
    dir
}

#[test]
fn qmlc_prints_a_named_themes_overrides() {
    let dir = scratch("named");
    std::fs::write(dir.join("mine.json"), r#"{ "Spacing": { "md": 20 } }"#).unwrap();
    let out = qmlc().current_dir(&dir).args(["--theme", "mine.json"]).output().unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    assert_eq!(
        String::from_utf8(out.stdout).unwrap().trim(),
        r#"{"file":"mine.json","overrides":[{"singleton":"Spacing","role":"md","value":20}]}"#
    );
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn qmlc_refuses_a_named_theme_that_is_not_there() {
    let dir = scratch("missing");
    let out = qmlc().current_dir(&dir).args(["--theme", "gone.json"]).output().unwrap();
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).starts_with("gone.json:"), "{}", String::from_utf8_lossy(&out.stderr));
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn qmlc_tells_a_refused_theme_as_file_line_column() {
    let dir = scratch("refused");
    std::fs::write(dir.join("theme.json"), "{\n  \"Colors\": { \"acent\": \"#6a1b9a\" }\n}").unwrap();
    let out = qmlc().current_dir(&dir).args(["--theme", "theme.json"]).output().unwrap();
    assert!(!out.status.success());
    assert!(out.stdout.is_empty());
    assert_eq!(String::from_utf8(out.stderr).unwrap().trim(), "theme.json:2:15: Colors has no role \"acent\"");
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn qmlc_finds_the_theme_nearest_an_entry_up_to_the_root() {
    let dir = scratch("found");
    std::fs::write(dir.join("theme.json"), r#"{ "Spacing": { "md": 24 } }"#).unwrap();
    std::fs::write(dir.join("app/pages/Main.qml"), "import QtQuick\nItem {}\n").unwrap();
    let found = qmlc().current_dir(&dir).args(["--theme-for", "app/pages/Main.qml", "--root", "."]).output().unwrap();
    assert!(found.status.success(), "{}", String::from_utf8_lossy(&found.stderr));
    let stdout = String::from_utf8(found.stdout).unwrap();
    assert!(stdout.contains(r#""role":"md","value":24"#), "{stdout}");
    // The root is the project: nothing above it is read.
    let none = qmlc().current_dir(&dir).args(["--theme-for", "app/pages/Main.qml", "--root", "app"]).output().unwrap();
    assert!(none.status.success(), "{}", String::from_utf8_lossy(&none.stderr));
    assert_eq!(String::from_utf8(none.stdout).unwrap().trim(), "null");
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn qmlc_holds_a_theme_to_the_seed_hue_it_is_given() {
    let dir = scratch("hue");
    std::fs::write(dir.join("theme.json"), r##"{ "Colors": { "textMuted": "#777777" } }"##).unwrap();
    let told = |hue: &str| {
        let out = qmlc().current_dir(&dir).args(["--theme", "theme.json", "--seed-hue", hue]).output().unwrap();
        assert!(!out.status.success());
        String::from_utf8(out.stderr).unwrap()
    };
    assert_eq!(
        told("0"),
        messages(&theme::check("theme.json", r##"{ "Colors": { "textMuted": "#777777" } }"##, Some(0.0)).unwrap_err())
            .iter()
            .map(|line| format!("{line}\n"))
            .collect::<String>()
    );
    assert_ne!(told("0"), told("240"));
    std::fs::remove_dir_all(&dir).unwrap();
}
