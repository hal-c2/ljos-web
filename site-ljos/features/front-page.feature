Feature: The front page shows software being reshaped while it runs
  The page's claim is that an app can be changed while it runs, so the
  first screen shows that: a small app turned from a list into a board
  by an agent's call, the typed TypeScript that lays it out beside it,
  and controls that make the same change by hand. The agent is a
  recorded replay and always says so. What it calls is real: the app on
  the page answers, and the code shown is the file the app runs.

  Covered by site-ljos/e2e/agent.spec.js, and the page as written by
  site-ljos/tests/site-ljos.spec.js.

  Background:
    Given the built site's front page, in the shell it is written in

  Scenario: A desktop reader sees the change, its source and its controls at once
    Given a window 1440 wide and 900 high
    When the page opens
    Then the board, its TypeScript, its List and Board controls and the replay's Pause or Run are all in the first screen

  Scenario: A phone reader sees the change start
    Given a window 390 wide and 844 high
    When the page opens
    Then the layout's change and the top of the app it changes are in the first screen

  Scenario Outline: The replay is never taken for a live agent
    Given a window <width> wide
    When the reader picks any of the replay's tabs
    Then "Replay · no live agent" stays shown above the app while it plays

    Examples:
      | width |
      | 1440  |
      | 390   |

  Scenario: The replay plays by itself
    Given a reader who has not asked for less motion
    When the replay is on screen
    Then it starts without a press, as the list
    And the agent's call turns the running app into a board
    And the reader can pause it

  Scenario: Less motion still shows the result
    Given a reader who asked for less motion
    When the page opens
    Then the board stands finished beside its TypeScript
    And nothing plays until the reader presses Run

  Scenario: The TypeScript shown is the TypeScript that runs
    When the page opens
    Then the code beside the app is bundle/Demos/logic/board.ts, word for word

  Scenario: The reader changes it themselves
    Given the replay has ended
    When the reader picks List
    Then the same running app is a list again, with every change made to it kept
