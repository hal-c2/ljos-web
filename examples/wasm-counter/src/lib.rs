//! A `Counter` as an application writes one for Ljós on the desktop
//! (`docs/MIGRATION.md` §6 of ljos-ui). Nothing here knows of the browser:
//! `ljos-web faces` builds this with the `web` feature, and the derive and
//! `#[qml_impl]` make the type's face (`docs/LJOS_WEB.md` A22).

use ljos::prelude::*;

#[derive(Debug, QmlObject)]
#[qml(module = "Example", name = "Counter")]
pub struct Counter {
    #[qml(notify)]
    pub count: i32,
    #[qml(notify)]
    pub step: i32,
}

impl Default for Counter {
    fn default() -> Self {
        Self { count: 0, step: 1 }
    }
}

#[qml_impl]
impl Counter {
    #[qml(signal)]
    fn bumped(value: i32);

    /// Adds `step`; `bumped` carries the new count.
    #[qml(invokable)]
    fn increment(cx: &Cx) -> Result<(), EngineError> {
        let n = cx.get(Counter::COUNT)? + cx.get(Counter::STEP)?;
        cx.set(Counter::COUNT, n)?;
        Counter::emit_bumped(cx, n)
    }
}

pub fn register(engine: &Engine) {
    engine.register_module(ljos::module!("Example" 1.0 => [Counter]));
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;

    fn counter(engine: &Engine) -> ObjectId {
        register(engine);
        engine.create_by_name("Example", "Counter", None).unwrap()
    }

    #[test]
    fn counts_by_one_until_told_otherwise() {
        let engine = ljos::engine();
        let counter = counter(&engine);
        engine.invoke_by_name(counter, "increment", &[]).unwrap();
        engine.invoke_by_name(counter, "increment", &[]).unwrap();
        assert_eq!(engine.get(counter, Counter::COUNT), Ok(2));
    }

    #[test]
    fn counts_by_its_step() {
        let engine = ljos::engine();
        let counter = counter(&engine);
        engine.set(counter, Counter::STEP, 5).unwrap();
        engine.invoke_by_name(counter, "increment", &[]).unwrap();
        assert_eq!(engine.get(counter, Counter::COUNT), Ok(5));
    }

    #[test]
    fn a_new_counter_starts_at_nothing_by_one() {
        let engine = ljos::engine();
        let counter = counter(&engine);
        assert_eq!(engine.get(counter, Counter::COUNT), Ok(0));
        assert_eq!(engine.get(counter, Counter::STEP), Ok(1));
    }
}
