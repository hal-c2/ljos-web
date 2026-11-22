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
