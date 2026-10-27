//! Parse every `.qml` file given on the command line and report syntax errors.

use oxc_allocator::Allocator;

fn main() {
    let (mut ok, mut failed) = (0, 0);
    for path in std::env::args().skip(1) {
        let source = std::fs::read_to_string(&path).expect("readable file");
        let allocator = Allocator::default();
        let parsed = qml_syntax::parse(&allocator, &source);
        if parsed.diagnostics.is_empty() {
            ok += 1;
            continue;
        }
        failed += 1;
        for diagnostic in &parsed.diagnostics {
            let (line, _) = diagnostic.position(&source);
            println!("{path}:{line}: {}", diagnostic.message);
        }
    }
    println!("{ok} parsed, {failed} failed");
}
