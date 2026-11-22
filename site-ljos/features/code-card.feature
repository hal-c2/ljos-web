Feature: A code card works on the narrowest phone, and gives its code as the reader has it
  Every fenced block of the docs is a card: its head names the file or
  has a tab for each, Copy gives the code, and a block that runs has a
  toolbar over its stage. On a screen 320 px wide nothing in the card is
  clipped or covered, in light or dark, and scrolling over a card is
  never held back from the browser unless the card takes the wheel.

  Covered by site-ljos/tests/code.spec.js, and for the wheel by
  packages/runtime/tests/views.spec.js.

  Scenario: Every file's tab can be reached on a narrow phone
    Given a live example of several files on a screen 320 px wide, in light or dark
    When the keyboard goes from Copy back to the first tab and on to the last
    Then the tab with the keyboard is whole and under the pointer, clear of Copy
    And the card itself is never scrolled to show it

  Scenario: An edited, running example's toolbar fits a narrow phone
    Given a live example on a screen 320 px wide, in light or dark
    When the reader runs it and edits its code
    Then every control of its toolbar and the word "Edited" are inside the toolbar
    And none of them overlaps another

  Scenario: Copy gives a live example's code as edited
    Given a live example whose code the reader has edited
    When they press Copy
    Then the clipboard has the edited code

  Scenario: Copy without a clipboard never says it copied
    Given a page with no clipboard
    When the reader presses Copy
    Then the card never says "Copied"

  Scenario: Only a view that goes sideways may hold the wheel back
    Given a Flickable that goes up and down and one that goes only sideways
    Then only the sideways one has a wheel listener that may cancel the scroll

  Scenario: A column in a sideways row keeps its wheel
    Given a column that can scroll down, in a row that goes only sideways
    When the wheel turns down over the column
    Then the column scrolls and the row stays where it is
