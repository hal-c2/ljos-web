//! A page's theme file, read and checked by `ljos_design` as ljos-ui's
//! `docs/theme.md` has it, and told to the runtime as the overrides it puts on
//! `Ljos.Design`'s singletons.
//!
//! Nothing here touches the disk: a page that compiles in the browser has its
//! files only as names and text, so the search is over names it is given.

pub use ljos_design::theme::{FILE, Setting, Theme, ThemeError};

/// Reads `text` as the theme `file` and holds its colours to the contrast the
/// palette promises at `seed_hue` (the theme's own when it sets one, else the
/// module's).
///
/// # Errors
/// Every mistake, first in the file first, each told as
/// `file:line:column: message`. A theme with one is refused whole.
pub fn check(file: &str, text: &str, seed_hue: Option<f64>) -> Result<Theme, Vec<ThemeError>> {
    let theme = ljos_design::theme::parse(file, text)?;
    theme.check_contrast(seed_hue)?;
    Ok(theme)
}

/// The theme file an entry in `entry_dir` reads when none is named, among the
/// names `has` says are there: `theme.json` in `entry_dir`, then each
/// directory above it up to `project`, both included, and nothing above it.
/// The same search as `ljos_design::theme::find`, over names: directories are
/// `/`-separated and relative to one another the same way, `""` the top.
pub fn nearest(entry_dir: &str, project: &str, has: impl Fn(&str) -> bool) -> Option<String> {
    let project: Vec<&str> = parts(project).collect();
    let mut dir: Vec<&str> = parts(entry_dir).collect();
    loop {
        let file = dir.iter().copied().chain([FILE]).collect::<Vec<_>>().join("/");
        if has(&file) {
            return Some(file);
        }
        if dir == project || !dir.starts_with(&project) {
            return None;
        }
        dir.pop()?;
    }
}

fn parts(dir: &str) -> impl Iterator<Item = &str> {
    dir.split('/').filter(|part| !part.is_empty() && *part != ".")
}

/// The theme as the runtime takes it: each role it sets, in the file's order,
/// a colour as the variants it gives.
///
/// ```json
/// {"file":"theme.json","overrides":[
///   {"singleton":"Spacing","role":"md","value":20},
///   {"singleton":"Colors","role":"accent","variants":{"light":"#6a1b9a","dark":"#dda0dd"}}]}
/// ```
pub fn json(theme: &Theme) -> String {
    let mut out = format!("{{\"file\":{},\"overrides\":[", string(&theme.file));
    for (at, entry) in theme.entries.iter().enumerate() {
        if at > 0 {
            out.push(',');
        }
        out += &format!("{{\"singleton\":{},\"role\":{},", string(entry.singleton), string(&entry.name));
        match &entry.value {
            Setting::Color(variants) => {
                let given = [
                    ("light", &variants.light),
                    ("dark", &variants.dark),
                    ("lightHigh", &variants.light_high),
                    ("darkHigh", &variants.dark_high),
                ];
                let fields: Vec<String> = given
                    .iter()
                    .filter_map(|(name, colour)| Some(format!("\"{name}\":{}", string(colour.as_deref()?))))
                    .collect();
                out += &format!("\"variants\":{{{}}}", fields.join(","));
            }
            Setting::Int(value) => out += &format!("\"value\":{value}"),
            Setting::Real(value) => out += &format!("\"value\":{value}"),
            Setting::Curve(points) => {
                let points: Vec<String> = points.iter().map(f64::to_string).collect();
                out += &format!("\"value\":[{}]", points.join(","));
            }
        }
        out.push('}');
    }
    out + "]}"
}

fn string(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for c in text.chars() {
        match c {
            '"' => out += "\\\"",
            '\\' => out += "\\\\",
            c if c < ' ' => out += &format!("\\u{:04x}", c as u32),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
