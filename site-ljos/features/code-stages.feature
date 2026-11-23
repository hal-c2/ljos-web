Feature: A code block's window before its example runs
  A live example stands as a picture until the reader runs it. The
  window shows the picture drawn in the page's scheme, and says so
  where that scheme's picture has nothing in it.

  Scenario: The dark page shows the picture drawn in the dark
    Given an example that looks different in the dark
    When the reader uses the dark theme
    Then the window shows the example's dark picture

  Scenario: A reader fetches only the picture that shows
    Given an example that looks different in the dark
    When the reader opens its page in one scheme
    Then only that scheme's picture of it is fetched
    And the other is fetched when the reader changes the theme

  Scenario: One picture serves both schemes where they are the same
    Given an example that looks the same in both schemes
    When the reader uses the dark theme
    Then the window still shows the example's one picture

  Scenario: Pale content is not an empty window
    Given an example that draws only a colour close to the paper
    When the build draws its pictures
    Then neither picture counts as empty

  Scenario: A window with nothing on its own ground is empty
    Given an example whose window shows only its background before it runs
    When the build draws its pictures
    Then its picture counts as empty in that scheme

  Scenario: A window's picture is the size the window asked
    Given an example whose window draws below the size an unsized example gets
    When the build draws its pictures
    Then that content is in the picture
    And neither picture counts as empty

  Scenario: An example that draws as it starts is not called empty
    Given a window that shows controls or words as it starts
    When the build draws its pictures
    Then its picture has that content in it
    And the window doesn't say "Nothing drawn yet"

  Scenario: Only the scheme that draws nothing says so
    Given an example that draws in one scheme and nothing in the other
    When the reader switches between the light and dark themes
    Then "Nothing drawn yet" shows only in the scheme that draws nothing

  Scenario: The line asks for a Run only where there is one to press
    Given an example that draws nothing
    When the window says "Nothing drawn yet"
    Then it says "Run it to see what it does" while the example waits for its Run
    And it leaves that out where the example cannot run
    And it leaves that out once the reader has run it

  Scenario: "Nothing drawn yet" stands on the page's paper
    Given an example whose empty picture has a ground of its own
    When the window says "Nothing drawn yet"
    Then the window's paper hides that picture
    And a picture with something in it still shows

  Scenario: An example that stops its renderer takes no other example with it
    Given an example whose uncaught error halts the runtime it is made on
    And windows with words in a Pane after it, and a second such example among them
    When the build prerenders them together in both schemes
    Then each of those two is a failure that says it halted
    And every window after them has its words in both schemes

  Scenario: An example that fails only in the dark keeps its light render
    Given an example that throws only as it is made in the dark scheme
    When the build prerenders it beside one that runs
    Then it is no failure: its light render is kept, and it stays live
    And it has no dark render, so the dark window shows the light one
    And its dark refusal is kept, said to be in the dark scheme, and a later build of it fails nothing
    And the one beside it still has both its pictures' renders

  Scenario: What an example says only in the dark is in the build's record
    Given an example that warns only as it is made in the dark scheme
    When the build prerenders it
    Then the record has the warning, said to be in the dark scheme
