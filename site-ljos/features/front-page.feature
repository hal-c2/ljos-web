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
    And the request says "Working…" while the calls go on, and "Done. Try Assign crew or List / Board." only once the last has answered
    And the TypeScript that makes the board fits beside it at 14 pixels, with no line wrapped or cut
    And the request, how it stands, List and Board, the replay's label and its one button are one toolbar
    And that button is quiet, at the toolbar's end and before the app in Tab's order

  Scenario: A phone reader sees the change start
    Given a window 390 wide and 844 high
    When the page opens
    Then the request, the replay's Pause and the top of the app it changes are in the first screen
    And the TypeScript under the app fits at 14 pixels, with no line wrapped or cut

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
    Then it starts without a press, as the list of tickets BG-412 and BG-415 under "Dispatch"
    And it doesn't say Done when the app becomes a board, but when its last call has answered
    And the agent's calls turn the running app into a board and fill it
    And the reader can pause it with the keyboard alone
    And it ends with one ticket in "Needs a crew" and nothing left running
    And then it says it is the reader's turn and what to press, and its button says it plays again

  Scenario: Less motion still shows the result
    Given a reader who asked for less motion
    When the page opens
    Then the board stands finished beside its TypeScript
    And List and Board change it without a press on Run
    And nothing plays until the reader presses Run
    And until then nothing says Done: what stands is said to be the end result
    And pressed, Run plays the calls one after another, moving less

  Scenario: The app fits what it shows, and the page stays put
    Given a window 1440 or 390 wide
    When the replay plays to its end and the reader gives the last ticket its crew
    Then the app's frame is no taller than what is in it
    And no ticket and no heading is cut
    And what stands under the replay has not moved
    And turning Open only off, for every ticket assigned, does not move it either
    And with no ticket in "Needs a crew", "Crew assigned" takes the app's whole width
    And the list and the board, filtered or not, with every ticket assigned, do not move it

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
