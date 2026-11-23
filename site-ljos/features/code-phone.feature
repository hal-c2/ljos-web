Feature: A code block on a phone
  Long code folds after its first dozen lines, so a reader meets what
  an example does before how it does it. A fold hides no code from a
  reader, whether or not the page's scripts run.

  Scenario: Folded code can be read without scripts
    Given a phone with scripts off and an example longer than a screenful
    When the reader scrolls inside the folded code
    Then its last line shows
    And scrolling on from there moves the page

  Scenario: The fold's button keeps the reader's focus
    Given a phone and an example longer than a screenful
    When the reader tabs out of its code to Show less and presses Enter
    Then the code folds and Show all has the focus, in view
    And pressing Enter again unfolds it with Show less focused

  Scenario: Reading and tabbing follow what a phone shows
    Given a phone and an example longer than a screenful
    When the reader goes through the example in page or Tab order
    Then the stage comes first, then its toolbar, then its code

  Scenario: Crossing a phone's width keeps the reader's place
    Given a live example that ran, was used, and has the focus on its Stop button
    When the page narrows to a phone's width, and widens again
    Then Stop has the focus each time, and Tab goes on from it
    And the running example still shows what the reader did in it

  Scenario: A fold that goes away hands its focus on
    Given a phone, and the focus on Show less under a live example's long code
    When the page widens past a phone's width, so the code no longer folds
    Then the example's Run button has the focus
    And Tab goes on from it

  Scenario: A running example's field keeps the keys across a phone's width
    Given a live example that runs a text field, with the reader typing in it
    When the page narrows to a phone's width, and widens again
    Then each key the reader types goes on into the field, where they were typing
