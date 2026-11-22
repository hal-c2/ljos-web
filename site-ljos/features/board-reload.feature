Feature: An edited board replaces the one that runs, and the work stays
  An app's board is laid out by a module of its build. An edit is another
  module of that build, put in by the same reload a shell takes: the page
  compiles nothing, and no property of the app stands in for the edit.

  Covered by site-ljos/tests/board-reload.spec.js, on a minified build of
  the dispatch app the front page shows.

  Scenario: The edited board keeps the crew a ticket was given
    Given the dispatch app running a board module that makes one list
    And Feeder 12 was given the on-call crew there
    When the edited module takes the running one's place
    Then the app is made again from that module, as two lanes
    And Feeder 12 is in "Crew assigned" with the on-call crew
    And the heading and the other tickets are as they were
    And no compiler was fetched

  Scenario: An edit that fails keeps the last board
    Given the dispatch app running a board module, with a crew assigned
    When an edited module throws as it loads, or cannot be fetched
    Then the last board still runs, with that crew
    And the reload says why
