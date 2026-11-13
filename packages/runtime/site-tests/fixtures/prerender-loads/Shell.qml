import QtQuick

// What a type makes for its own ends, not as its element: a picture's
// load, made once per picture in a reader's browser but once per item
// in a prerender, which is given no picture and so tries again; and
// the copy of a text's markup, made as often as a cache misses. None
// of it may move the count the page's own elements are taken over by.
Column {
    Image { source: "images/dot.svg"; width: 24; height: 24 }
    Image { source: "images/dot.svg"; width: 24; height: 24 }
    Text { text: "<b>Marked</b> words, <a href=\"https://example.com/\">linked</a>" }
    Text { text: "<b>Marked</b> words, <a href=\"https://example.com/\">linked</a>" }
    Text { text: "After the pictures and the markup" }
    Rectangle { width: 40; height: 20; color: "teal" }
}
