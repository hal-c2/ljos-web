Feature: ljos.dev runs on Ljós on the desktop
  The site is written in the dialect Ljós runs, so the same bundle that
  ljos.dev serves runs in a desktop window on Ljós. `mise run
  site:native` builds the pages, search and pictures as files, builds
  ljos at the commit site/ljos-ui.sha pins (or takes LJOS_BIN), and runs
  the site in a window. What the desktop can't do yet shows a
  placeholder that says so, never a crash or a blank.

  Covered by `mise run site:native --check`, which runs the site
  off-screen and follows it as a reader would (site-ljos/scripts/
  native-check.mjs), and by the site-native job in
  .github/workflows/site.yml. The desktop's back and forward, a page
  that cannot be read among them, are also run in node by
  site-ljos/tests/nav-desktop.spec.js. The check's own
  handling of its inspector is run against a stand-in for ljos by
  site-ljos/tests/native-check.spec.js.

  Scenario: The front page, a docs page and the showcase open
    Given the site runs on Ljós off-screen at 1280 by 800
    When the front page is up
    And the reader follows the header's Docs link
    Then a docs page reads "What is Ljós?"
    When the reader follows the header's Showcase link
    Then the showcase is up

  Scenario: Nothing is logged as an error but the gaps named in the check
    Given the site ran through the front page, a docs page and the showcase
    Then no line it logged reads as an error, a binding loop or an unhandled rejection
    But not the lines native-check.mjs names as known gaps, each with what it waits for

  Scenario: Pages are read from files, not from the address bar
    Given the site runs on the desktop with --site naming the built pages
    When the reader follows a link
    Then the page comes from that directory's files

  Scenario Outline: Every shell runs on the desktop
    Given the site runs on Ljós
    When the reader switches to the <shell> shell
    Then the showcase stands in that shell with no error logged

    Examples:
      | shell     |
      | Cyberpunk |
      | Workbench |
      | Desktop   |
      | Elegant   |

  Scenario: Back and forward are the desktop's own
    Given the reader went from the front page to a docs page and to the showcase
    When the reader follows the header's Docs link twice
    And presses Alt+Left
    Then the showcase is shown, as the second Docs made no entry of its own
    When the reader presses Alt+Left twice quickly
    Then the front page is shown

  Scenario: A page that cannot be read leaves the list as it was
    Given the site runs on the desktop
    When the reader follows a link to a page whose reading is missing
    Then the page shown stays, a warning names the file
    And Back and forward go where they went before

  Scenario: The search works on the desktop
    Given the site runs on Ljós
    When the reader types "Item" into the search field
    Then results come from the search.json the build wrote beside the pages

  Scenario: What the desktop can't do yet shows a placeholder
    Given the site runs on Ljós
    When a page holds live editing, the Observer or a demo's frame
    Then a placeholder stands in its place and names what it waits for
    And the rest of the page works

  Scenario: A request the inspector leaves unanswered is asked again
    Given the site runs on Ljós off-screen
    When the inspector leaves a request unanswered for a while, the app idle
    Then the check says which request it was and what it waited for
    And it asks again within the same step
    And the step fails only when its end comes with no answer

  Scenario: The task explains itself and runs in a quick mode
    When `mise run site:native --help` runs
    Then it names --check and --release
    And tasks:smoke lists site:native
