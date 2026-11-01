//! Where in its file each object, binding and logged line is written, put
//! in the output when asked (`Options::inspect`) for an inspector to read
//! (`ljos-web/inspect`). A page built without it carries none of this.

use oxc_ast::ast::Expression;

use crate::build::B;

/// A file's lines, by where each starts.
pub(crate) struct Places {
    /// What the file is called in the places: the inspector says this.
    pub file: String,
    starts: Vec<usize>,
    source: String,
}

impl Places {
    pub(crate) fn new(file: &str, source: &str) -> Self {
        let starts = std::iter::once(0)
            .chain(source.match_indices('\n').map(|(at, _)| at + 1))
            .collect();
        Self {
            file: file.to_string(),
            starts,
            source: source.to_string(),
        }
    }

    /// The line and column of `offset`, from one, the column in characters
    /// as [`crate::Error::position`] counts them.
    pub(crate) fn at(&self, offset: u32) -> (usize, usize) {
        let offset = (offset as usize).min(self.source.len());
        let line = self.starts.partition_point(|start| *start <= offset);
        let start = self.starts[line - 1];
        let column = self
            .source
            .get(start..offset)
            .map_or(0, |text| text.chars().count())
            + 1;
        (line, column)
    }

    /// `[file, line, column]`.
    pub(crate) fn place<'a>(&self, b: B<'a>, offset: u32) -> Expression<'a> {
        let (line, column) = self.at(offset);
        #[expect(clippy::cast_precision_loss)]
        b.array([
            b.string(&self.file),
            b.number(line as f64),
            b.number(column as f64),
        ])
    }

    /// `[file, line, column, type]`: an object's, with the type it is
    /// written as there.
    pub(crate) fn object<'a>(&self, b: B<'a>, offset: u32, type_name: &str) -> Expression<'a> {
        let (line, column) = self.at(offset);
        #[expect(clippy::cast_precision_loss)]
        b.array([
            b.string(&self.file),
            b.number(line as f64),
            b.number(column as f64),
            b.string(type_name),
        ])
    }
}

#[cfg(test)]
mod tests {
    use super::Places;

    #[test]
    fn a_place_counts_lines_and_characters_from_one() {
        let places = Places::new("Main.qml", "Item {\n    Text { text: \"é\" }\n}\n");
        assert_eq!(places.at(0), (1, 1));
        assert_eq!(places.at(11), (2, 5));
        // `é` is two bytes and one character.
        assert_eq!(places.at(29), (2, 22));
        assert_eq!(places.at(31), (3, 1));
    }
}
