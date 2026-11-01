//! ljos-web's QML compiler as wasm: what `ljos-web/compiler` loads the first
//! time a page compiles.
//!
//! The boundary is a JSON text each way, through memory the page asks the
//! module for: a compile is one call, and its texts (the project's files,
//! the modules compiled) are the bulk of what crosses whatever it is
//! wrapped in, so no wasm-bindgen.

use std::collections::{BTreeMap, BTreeSet};

use ljos_web::given::{self, Alias, Target};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct Request {
    files: BTreeMap<String, String>,
    entry: String,
    #[serde(default)]
    aliases: Vec<AliasJson>,
    #[serde(default)]
    imports: Vec<String>,
    modules: Option<BTreeSet<String>>,
    #[serde(default)]
    installed: Vec<String>,
    /// The project's type dumps among `files`; every `ljostypes.json` of
    /// them when not given.
    types: Option<Vec<String>>,
    #[serde(default)]
    inspect: bool,
}

#[derive(Deserialize)]
struct AliasJson {
    module: String,
    dir: String,
}

#[derive(Serialize)]
#[serde(untagged)]
enum Response {
    Compiled {
        modules: Vec<Module>,
        warnings: Vec<String>,
    },
    Refused {
        diagnostics: Vec<Diagnostic>,
    },
}

#[derive(Serialize)]
struct Module {
    file: String,
    code: String,
    links: Vec<Link>,
    metas: Vec<(u32, u32)>,
    exports: BTreeSet<String>,
}

#[derive(Serialize)]
struct Link {
    start: u32,
    end: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    module: Option<String>,
}

#[derive(Serialize)]
struct Diagnostic {
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    column: Option<usize>,
    message: String,
}

/// A shell a visitor dropped, and the contracts of the blocks it may use.
#[derive(Deserialize)]
struct ShellRequest {
    shell: Shell,
}

#[derive(Deserialize)]
struct Shell {
    text: String,
    blocks: Vec<ljos_web::shell::Contract>,
}

/// Compiles the request in `json`, answering in JSON.
pub fn compile(json: &str) -> String {
    // A shell is answered with data, its objects and programs, which the
    // page runs without making code of them.
    if let Ok(ShellRequest { shell }) = serde_json::from_str::<ShellRequest>(json) {
        let answer = match ljos_web::shell::compile(&shell.text, &shell.blocks) {
            Ok(file) => serde_json::json!({ "shell": ljos_web::shell::to_json(&file) }),
            Err(diagnostics) => serde_json::json!({ "diagnostics": diagnostics }),
        };
        return answer.to_string();
    }
    let response = match serde_json::from_str::<Request>(json) {
        Err(error) => Response::Refused {
            diagnostics: vec![Diagnostic {
                file: None,
                line: None,
                column: None,
                message: format!("not a compile: {error}"),
            }],
        },
        Ok(request) => answer(request),
    };
    serde_json::to_string(&response).expect("a response is always JSON")
}

fn answer(request: Request) -> Response {
    let request = given::Request {
        files: request.files,
        entry: request.entry,
        aliases: request
            .aliases
            .into_iter()
            .map(|alias| Alias {
                module: alias.module,
                dir: alias.dir,
            })
            .collect(),
        imports: request.imports,
        modules: request.modules,
        installed: request.installed,
        types: request.types,
        inspect: request.inspect,
    };
    match given::compile(&request) {
        Ok(compiled) => Response::Compiled {
            modules: compiled
                .modules
                .into_iter()
                .map(|module| Module {
                    file: module.file,
                    code: module.code,
                    links: module
                        .links
                        .into_iter()
                        .map(|link| {
                            let (file, module) = match link.target {
                                Target::File(file) => (Some(file), None),
                                Target::Module(module) => (None, Some(module)),
                            };
                            Link {
                                start: link.start,
                                end: link.end,
                                file,
                                module,
                            }
                        })
                        .collect(),
                    metas: module.metas,
                    exports: module.exports,
                })
                .collect(),
            warnings: compiled.warnings,
        },
        Err(diagnostics) => Response::Refused {
            diagnostics: diagnostics
                .into_iter()
                .map(|diagnostic| Diagnostic {
                    file: diagnostic.file,
                    line: diagnostic.line,
                    column: diagnostic.column,
                    message: diagnostic.message,
                })
                .collect(),
        },
    }
}

/// The page's side: it asks for memory, writes the request's UTF-8 there,
/// calls `compile`, reads `answer_len` bytes at what that returned, and
/// frees both.
#[cfg(target_arch = "wasm32")]
mod page {
    use std::cell::Cell;

    thread_local! {
        static ANSWER: Cell<usize> = const { Cell::new(0) };
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn alloc(len: usize) -> *mut u8 {
        let mut bytes = Vec::<u8>::with_capacity(len);
        let at = bytes.as_mut_ptr();
        std::mem::forget(bytes);
        at
    }

    /// # Safety
    /// `at` and `len` are those of an `alloc` or a `compile` answer.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn free(at: *mut u8, len: usize) {
        // SAFETY: as the caller promises, a Vec's buffer of `len` capacity.
        drop(unsafe { Vec::from_raw_parts(at, 0, len) });
    }

    /// # Safety
    /// `at` holds `len` bytes the page wrote.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn compile(at: *const u8, len: usize) -> *mut u8 {
        // SAFETY: as the caller promises.
        let bytes = unsafe { std::slice::from_raw_parts(at, len) };
        let answer = match std::str::from_utf8(bytes) {
            Ok(json) => super::compile(json),
            Err(_) => r#"{"diagnostics":[{"message":"not a compile: not UTF-8"}]}"#.to_string(),
        };
        let mut answer = answer.into_bytes();
        answer.shrink_to_fit();
        ANSWER.with(|len| len.set(answer.len()));
        let at = answer.as_mut_ptr();
        std::mem::forget(answer);
        at
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn answer_len() -> usize {
        ANSWER.with(Cell::get)
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_compile_answers_its_modules_and_links_in_json() {
        let answer = super::compile(
            r#"{"files":{"Main.qml":"import QtQuick\nItem { Panel { } }\n","Panel.qml":"import QtQuick\nItem { }\n"},"entry":"Main.qml"}"#,
        );
        let answer: serde_json::Value = serde_json::from_str(&answer).unwrap();
        let modules = answer["modules"].as_array().expect("compiled");
        assert_eq!(modules[0]["file"], "Main.qml");
        assert!(
            modules[0]["links"]
                .as_array()
                .unwrap()
                .iter()
                .any(|link| link["file"] == "Panel.qml")
        );
        assert!(
            modules[0]["links"]
                .as_array()
                .unwrap()
                .iter()
                .any(|link| link["module"] == "ljos-web/QtQuick")
        );
    }

    #[test]
    fn a_shell_is_answered_with_data_or_where_it_is_refused() {
        let blocks = r#"[{"module":"Shop","name":"Basket","version":"1.0","file":"Shop/Basket.qml","base":"Rectangle","properties":[{"name":"count","ty":"int","readonly":true}],"actions":[],"events":[]}]"#;
        let ask = |text: &str| {
            let request = format!(
                r#"{{"shell":{{"text":{},"blocks":{blocks}}}}}"#,
                serde_json::to_string(text).unwrap()
            );
            serde_json::from_str::<serde_json::Value>(&super::compile(&request)).unwrap()
        };
        let answer = ask(
            "import QtQuick\nimport Shop\nColumn { Basket { id: b }\n Text { text: b.count } }\n",
        );
        assert_eq!(
            answer["shell"]["components"][0]["objects"]
                .as_array()
                .unwrap()
                .len(),
            3
        );
        let answer = ask("import QtQuick\nColumn { Text { text: window.name } }\n");
        assert_eq!(answer["diagnostics"][0]["line"], 2);
    }

    #[test]
    fn what_is_not_a_compile_is_a_diagnostic() {
        let answer: serde_json::Value = serde_json::from_str(&super::compile("{}")).unwrap();
        assert!(
            answer["diagnostics"][0]["message"]
                .as_str()
                .unwrap()
                .starts_with("not a compile")
        );
    }
}
