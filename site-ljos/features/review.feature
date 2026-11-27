Feature: A totally biased review of mostly Rust UI frameworks
  The review (/review/) compares the UI frameworks the same app was
  written in: a team inbox (10 000 issues, a virtualised list, search, a
  validated edit form, a weekly chart), once in each framework. Each
  framework has a section in the voice of someone who loves it, with the
  inbox's own code, and then where it is not as strong, said as plainly
  for Ljós as for the rest. A reader picks the frameworks to compare and
  sees only those in the numbers, the charts and the code.

  The page is data (site-ljos/bundle/Review/review.json): the
  frameworks and their links, every measured number with its runs, its
  spread and the command that made it, the code excerpts by feature,
  and the words of each section. A number or excerpt still waiting for
  its measurement is marked as a placeholder, and the page says so.

  Covered by site-ljos/tests/review.spec.js, with the route in
  parity.spec.js, hydrate.spec.js, a11y.spec.js and payload.spec.js.

  Background:
    Given the site is built

  Scenario: Every page leads to the review
    When a reader with no script opens any page
    Then its footer has a link "Framework review" to /review/

  Scenario: Search finds the review
    When a reader searches for "biased"
    Then the results list "Totally biased review of mostly Rust UI frameworks", which leads to /review/

  Scenario: The review stands whole before any script runs
    When a reader with no script opens /review/
    Then the page's heading is "Totally biased review of mostly Rust UI frameworks"
    And its first words say the bias is the point
    And every framework of the data has a section with its name as a heading
    And each section shows the inbox code its fan would show first, under its file and lines
    And each section links to the framework's site, its docs and its repository
    And each section says where the framework is not as strong

  Scenario: The reader picks the frameworks to compare
    When a reader opens /review/
    Then a button for each framework says whether it is picked
    And the charts show a bar for each picked framework and for no other
    When the reader picks another framework
    Then each chart shows a bar for it too
    When the reader puts back all but two
    Then two stay picked, and the page says at least two are compared

  Scenario: Every number says where it came from
    When a reader opens /review/
    Then each bar names its framework and its value with its unit
    And the table of the picked frameworks gives each value's median, its spread and its runs
    And each chart names the command that measured it

  Scenario: The same feature in each picked framework's code
    When a reader opens /review/ and chooses the search
    Then the search code of each picked framework is shown, coloured as code, under its file and lines
    And no other framework's code is shown

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
