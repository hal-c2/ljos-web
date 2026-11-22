Feature: A code block's window before its example runs
  A live example stands as a picture until the reader runs it. The
  window shows the picture drawn in the page's scheme, and says so
  where that scheme's picture has nothing in it.

  Scenario: The dark page shows the picture drawn in the dark
    Given an example that looks different in the dark
    When the reader uses the dark theme
    Then the window shows the example's dark picture

  Scenario: One picture serves both schemes where they are the same
    Given an example that looks the same in both schemes
    When the reader uses the dark theme
    Then the window still shows the example's one picture

  Scenario: Pale content is not an empty window
    Given an example that draws only a colour close to the paper
    When the build draws its pictures
    Then neither picture counts as empty

  Scenario: Only the scheme that draws nothing says so
    Given an example that draws in one scheme and nothing in the other
    When the reader switches between the light and dark themes
    Then "Nothing drawn yet" shows only in the scheme that draws nothing
