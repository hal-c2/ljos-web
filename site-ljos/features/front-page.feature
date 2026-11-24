Feature: The front page shows software being reshaped while it runs
  The page's claim is that an app can be changed while it runs, so the
  first screen shows that: the request made of the agent, in words, the
  small app it turns from a list into a board by an edit of its
  board.ts, the typed TypeScript the running app was built from, and
  controls that make the same change by hand. The agent is a recorded
  replay and says so, once. What it calls is real: the app on the page
  answers. Its edit is real too: the site's build has a module of each
  version of board.ts, and the running app is reloaded from the edited
  one's, keeping what it was given.

  Covered by site-ljos/e2e/agent.spec.js, the page as written by
  site-ljos/tests/site-ljos.spec.js, and the reload, a failed one too,
  by site-ljos/tests/board-reload.spec.js (features/board-reload.feature).
  The watch under "See it run" by site-ljos/e2e/scenes.spec.js and
  e2e/calm.spec.js (its frames and its pace), tests/webgl2.spec.js (drawn
  without WebGPU), and tests/site-ljos.spec.js and tests/design.spec.js
  (its picture, from the first paint).

  Background:
    Given the built site's front page, in the shell it is written in

  Scenario: A desktop reader sees the request, the change, its source and its controls at once
    Given a window 1440 wide and 900 high
    When the page opens
    Then "Agent: make this a board", the app, its List and Board controls and one Pause or Run are all in the first screen
    And the request says "Working…" while the calls go on, and "Done. Try Assign crew or List / Board." only once the last has answered
    And the TypeScript the running app was built from fits beside it at 14 pixels, with no line wrapped or cut
    And the request, how it stands, List and Board, the replay's label and its one button are one toolbar
    And that button is quiet, at the toolbar's end and before the app in Tab's order

  Scenario: A phone reader sees the change start
    Given a window 390 wide and 844 high
    When the page opens
    Then the request, the replay's Pause and the top of the app it changes are in the first screen
    And above the app, two lines of the running app's board.ts stand with their line numbers
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
    Then it starts without a press, as one list of five tickets under "North district dispatch"
    And the code beside it is the list's board.ts
    And the agent finds Feeder 12's crew button by its name and presses it
    And its edit of board.ts is shown in its log as the lines taken out and put in
    And the running app is reloaded from the module built from the edited board.ts: a board, with Feeder 12's crew kept
    And the agent reads that crew back from the app
    And it doesn't say Done when the app becomes a board, but when its last call has answered
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
    And pressed, Run plays the steps one after another from the list, moving less

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
    Then the code beside the app is the function that makes its lanes, word for word from the board.ts its module was built from
    And that is bundle/Demos/logic/before/board.ts while it is a list, and logic/after/board.ts once it is a board

  Scenario: The reader changes it themselves
    Given the replay has ended
    When the reader picks List
    Then the app is reloaded from the list's module, with every change made to it kept
    And the code beside it is the list's board.ts again

  Scenario: A layout picked while the agent looks for a button is looked for again
    Given the replay has asked the app to find Feeder 12's "Assign crew" button
    When the reader picks the other layout before the app answers, and presses Play
    Then the replay asks the find again of the app that runs now
    And it presses the button that find answers with, never a button of the app that is gone

  Scenario: A failed edit keeps the last board
    Given the replay's app running a board module, with a crew assigned
    When an edited module throws as it loads
    Then the last board still runs, with that crew, and the reload says why

  Scenario: The Observer waits until it is wanted
    When the page opens and the reader presses nothing
    Then nothing of the whole Observer's is fetched

  Scenario Outline: The front page's 3D example is the watch
    Given a window <width> wide
    When the page opens
    Then under "See it run" stands the watch's picture, in the reader's scheme, in a frame its shape from the first paint
    And its Run is "Run the watch"
    And pressed, Run makes the watch: its software, worn with the pointer, beside the watch in 3D on its turntable
    And nothing on the page moves as it comes

    Examples:
      | width |
      | 1440  |
      | 390   |

  Scenario: The watch draws without WebGPU
    Given a browser with WebGPU off, or with WebGPU that gives the page no adapter
    When the reader runs the watch on the front page
    Then every View3D is drawn by wgpu on WebGL 2
    And the watch's case and band, from their glTF files, are in its picture

  Scenario: The watch keeps drawing frames
    Given the watch running on the front page, on screen
    When nobody touches the page
    Then its view draws frame after frame and its turntable turns
    And scrolled away, or in a hidden tab, it draws nothing
    And back on screen it turns on from where it held, never from where its turn began

  Scenario: Under reduced motion the watch still moves
    Given a reader who asked for less motion
    When the watch runs on the front page
    Then its turntable still turns and its view still draws, more slowly than with no preference
    And a change of preference while it runs is taken at once, from the angle it is at
