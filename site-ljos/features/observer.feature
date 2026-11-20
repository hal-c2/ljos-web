Feature: The Observer looks into what runs on the page
  Every live example and every demo on the site can be looked into
  with Ljós's own Observer, the one `ljos observe` opens on a native
  app. It runs in the page, against an inspector the page serves for
  the app on that stage: its objects as a tree, each one's properties
  and where they come from, the frames the app drew and why, and what
  it logged. What the Observer changes, the app shows; what the reader
  does in the app, the Observer shows. Nothing of the Observer is
  fetched until a reader opens it, and closed it costs nothing.

  Covered by site-ljos/e2e/observer.spec.js, and for the inspector and
  its client by packages/runtime/tests/observer.spec.js.

  Background:
    Given the built site, opened in a browser

  Scenario: A running example's toolbar offers the Observer
    When a reader runs a live example
    Then its toolbar has an "Observer" button, which a demo's has too once it runs
    And before it runs neither has one

  Scenario: The Observer is fetched only when it is opened
    When a reader opens a page and runs an example
    Then nothing of the Observer has been fetched
    When they press the example's "Observer"
    Then the Observer's chunk is fetched, and the Observer opens

  Scenario: On a wide screen it is docked beside the page
    Given a window 1000 pixels wide or wider
    When a reader opens the Observer on an example
    Then it stands along the right of the window, under the header
    And the page reflows beside it, so the example can still be pressed

  Scenario: On a phone it is a sheet
    Given a window narrower than 1000 pixels
    When a reader opens the Observer on an example
    Then it slides up over the lower part of the screen
    And a press above it closes it

  Scenario: Its tree is the example's objects
    When a reader opens the Observer on a running example
    Then its tree starts at the example's root, with the ids the example gives

  Scenario: What the reader does in the app, the Observer shows
    Given the Observer is open on a running example
    When the reader presses in the example
    Then the Observer's frames count a frame woken by input
    And a property the press changed shows its new value

  Scenario: What the Observer changes, the app shows
    Given the Observer is open on a running example
    When the reader gives one of the example's properties a value in the Observer
    Then the example draws with that value
    And reverting it gives the property its binding back

  Scenario: At rest nothing is counted
    Given the Observer is open on an example that holds still
    When nobody touches the page
    Then the Observer's frame count stays where it is

  Scenario: What the web cannot answer, the Observer says so
    When a reader opens a part of the Observer the web cannot fill, as a trace of a native process
    Then it says why, never a blank

  Scenario: The Observer follows the site's light and dark
    When a reader switches the site between light and dark with the Observer open
    Then the Observer and its frame switch with it

  Scenario: Closing it lets go of the app
    Given the Observer is open on an example
    When the reader closes it, or stops the example
    Then the Observer slides away, and nothing of it is left in the page
    And the example no longer serves an inspector

  Scenario: The flagship demo is looked into while its shell is rewritten
    Given the front page's Pantry, its app's own shell running
    When the reader presses the Pantry's "Observer"
    Then its tree starts at the app's shell, with the blocks the shell holds
    When they add a good to the basket
    Then the Observer's frames count a frame woken by input
    When they rewrite the shell and it applies
    Then the Observer follows the new shell, as it follows a reload

  Scenario: One Observer at a time
    Given the Observer is open on one example
    When the reader presses "Observer" on another
    Then the Observer is on the other, and only its button is pressed
