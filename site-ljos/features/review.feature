Feature: A totally biased review of mostly Rust UI frameworks
  The review (/review/) compares the UI frameworks the same app was
  written in: a team inbox (10 000 issues, a virtualised list, search, a
  validated edit form, a weekly chart), once in each framework. Each
  framework has a section in the voice of someone who loves it, with the
  inbox's own code, and then where it is not as strong, said as plainly
  for Ljós as for the rest. A reader picks the frameworks to compare and
  sees only those in the numbers, the charts, the code and the fans'
  sections; every framework's site, docs and repository are linked
  whichever are picked.

  The page is data (site-ljos/bundle/Review/review.json): the
  frameworks and their links, every measured number with its runs, its
  spread and the command that made it, the code excerpts by feature,
  and the words of each section. A number or excerpt still waiting for
  its measurement is marked as a placeholder, and the page says so.

  Covered by site-ljos/tests/review.spec.js and review-nav.spec.js,
  with the route in parity.spec.js, hydrate.spec.js, a11y.spec.js and
  payload.spec.js.

  Background:
    Given the site is built

  Scenario: Every page leads to the review
    When a reader with no script opens any page
    Then its footer has a link "Framework review" to /review/

  Scenario Outline: Each shell's main navigation leads to the review
    Given a reader in the <shell> shell, <width> wide
    When they open the shell's main navigation
    Then it has a link to /review/ with words, not an icon alone
    And Tab reaches it, and Enter opens the review

    Examples:
      | shell     | width |
      | Elegant   | 1440  |
      | Elegant   | 390   |
      | Cyberpunk | 1440  |
      | Cyberpunk | 390   |
      | Workbench | 1440  |
      | Workbench | 390   |
      | Desktop   | 1440  |
      | Desktop   | 390   |

  Scenario: The home page names the review in its own words
    When a reader opens the home page
    Then a link to /review/ stands in its words, apart from the footer

  Scenario: Search finds the review
    When a reader searches for "biased"
    Then the results list "Totally biased review of mostly Rust UI frameworks", which leads to /review/

  Scenario: The review stands whole before any script runs
    When a reader with no script opens /review/
    Then the page's heading is "Totally biased review of mostly Rust UI frameworks"
    And its first words say the bias is the point
    And every framework picked to start has a section with its name as a heading
    And each section shows the inbox code its fan would show first, under its file and lines
    And each section links to the framework's site, its docs and its repository
    And each section says where the framework is not as strong
    And every framework of the data, picked or not, is linked to its site, its docs and its repository

  Scenario: The reader picks the frameworks to compare
    When a reader opens /review/
    Then a button for each framework says whether it is picked
    And the charts show a bar for each picked framework and for no other
    And a fan's section is shown for each picked framework and for no other
    When the reader picks another framework
    Then each chart shows a bar for it too
    And its fan's section is shown too
    When the reader puts back all but two
    Then two stay picked, and the page says at least two are compared
    And only those two have a fan's section

  Scenario: Every number says where it came from
    When a reader opens /review/
    Then each bar names its framework and its value with its unit
    And the table of the picked frameworks gives each value's median, its spread and its runs
    And each chart names the command that measured each of its groups

  Scenario: Native and web numbers never share a scale
    Given a metric measured one way for native apps and another for web apps
    When a reader picks a native framework and a web framework
    Then the chart draws the native bars and the web bars as two groups, each on its own scale
    And each group says how it was measured and names the command that measured it
    And the chart says the two groups do not compare

  Scenario: A spread too small to matter is drawn small
    Given a metric whose least step that matters is larger than every picked framework's number
    When a reader opens /review/
    Then the chart's axis runs to that step, not to the largest number
    And a spread of a hundredth of a percent of idle CPU is not drawn across the chart

  Scenario: The same feature in each picked framework's code
    When a reader opens /review/ and chooses the search
    Then the search code of each picked framework is shown, coloured as code, under its file and lines
    And no other framework's code is shown

  Scenario: Every excerpt leads to its whole file, and the apps can be run
    Given every app, its data and the scripts that measured it are published in one repository
    When a reader with no script opens /review/
    Then each excerpt's file and lines link to that file in the repository, at the commit measured
    And a link "Run it yourself" leads to the repository at that commit

  Scenario: A placeholder never passes as a measurement
    Given a number or excerpt in the data that is marked as a placeholder
    When a reader opens /review/
    Then the page says, above the charts, that some numbers are placeholders

  Scenario: The review reads at a desk and on a phone, light and dark
    When a reader opens /review/ 1440 or 390 wide, in light or dark
    Then nothing stands wider than the window
    And the picker, the charts and the code fit the page

  Scenario: Less motion fades the bars in, it does not snap them
    Given a reader who asks for less motion
    When they pick another framework
    Then its bars stand at their length and fade in
    But for a reader who did not ask, they grow as they fade in

  Scenario: The numbers are shown one renderer set at a time, the GPU's first
    When a reader opens /review/
    Then a radio group "Renderer" offers "GPU", "Software (llvmpipe)", "Software, 4 threads" and "Software, each toolkit's own"
    And "GPU" is chosen
    When they choose another set, with the pointer or the arrow keys
    Then every timed chart and the table show that set's numbers alone
    And under each chart's group it says how that set ran: the renderer, the environment every app shared, the runs, the load average and the machine
    And a picked framework the set has no number of is said to be "Not measured in this set", with no number standing in
    And a size or a line count stays the same in every set

  Scenario: A framework on both platforms is in both groups
    Given a framework with a native entry and a web entry, Dioxus's desktop and web builds
    When a reader opens /review/
    Then the picker's "Native" group and its "Web" group each have one of them
    And each one's section names the other
    And another way to build a framework for the same platform, such as Qt Quick with its logic in Rust, is named among its own group's apps
    And an entry that could not do part of the spec says which part

  Scenario: Each entry shows its screenshot
    When a reader picks every framework, in light or dark
    Then each section the repository has a picture of shows it in the page's scheme, with alt text
    And a section the repository has no picture of yet shows none
    And the picture loads lazily, from the repository's site, so the page carries none

  Scenario: A web entry runs in the reader's browser
    When a reader picks every framework
    Then each web entry's section links "Run <name> in your browser" to its build on the repository's site
    And no native entry's does
