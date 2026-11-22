Feature: A code block on a phone
  Long code folds after its first dozen lines, so a reader meets what
  an example does before how it does it. A fold hides no code from a
  reader, whether or not the page's scripts run.

  Scenario: Folded code can be read without scripts
    Given a phone with scripts off and an example longer than a screenful
    When the reader scrolls inside the folded code
    Then its last line shows
    And scrolling on from there moves the page
