Feature: The front page shows software being reshaped while it runs
  The page's claim is that an app can be changed while it runs, so the
  first screen shows that: the request made of the agent, in words, the
  small app it turns from a list into a board, the typed TypeScript that
  lays that board out, and controls that make the same change by hand.
  The agent is a recorded replay and says so, once. What it calls is
  real: the app on the page answers, and the code shown is the file the
  app runs.

  Covered by site-ljos/e2e/agent.spec.js, and the page as written by
  site-ljos/tests/site-ljos.spec.js.

  Background:
    Given the built site's front page, in the shell it is written in

  Scenario: A desktop reader sees the request, the change, its source and its controls at once
    Given a window 1440 wide and 900 high
    When the page opens
    Then "Agent: make this a board", the app, its List and Board controls and one Pause or Run are all in the first screen
    And once the app is a board, "Done · applied live" stands beside the request
    And the TypeScript that makes the board fits beside it, with no line wrapped or cut

  Scenario: A phone reader sees the change start
    Given a window 390 wide and 844 high
    When the page opens
    Then the request, the replay's Pause and the top of the app it changes are in the first screen
    And the TypeScript under the app has no line wrapped or cut

  Scenario Outline: The replay is never taken for a live agent
    Given a window <width> wide
    When the reader picks any of the replay's tabs
    Then "Replay · no live agent" is shown once, beside the replay's one Pause

    Examples:
      | width |
      | 1440  |
      | 390   |

  Scenario: The replay plays by itself
    Given a reader who has not asked for less motion
    When the replay is on screen
    Then it starts without a press, as the list
    And the agent's calls turn the running app into a board and fill it
    And the reader can pause it with the keyboard alone
    And it ends with one ticket in "Needs a crew" and nothing left running

  Scenario: Less motion still shows the result
    Given a reader who asked for less motion
    When the page opens
    Then the board stands finished beside its TypeScript
    And List and Board change it without a press on Run
    And nothing plays until the reader presses Run
    And pressed, Run plays the calls one after another, moving less

  Scenario: The TypeScript shown is the TypeScript that runs
    When the page opens
    Then the code beside the app is the function in bundle/Demos/logic/board.ts that makes the board, word for word

  Scenario: The reader changes it themselves
    Given the replay has ended
    When the reader picks List
    Then the same running app is a list again, with every change made to it kept

  Scenario: The Observer waits until it is wanted
    When the page opens and the reader presses nothing
    Then nothing of the whole Observer's is fetched
