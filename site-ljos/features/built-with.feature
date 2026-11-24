Feature: The site shows what is built with Ljós
  Apps and tools made with Ljós stand on the site with a capture of each
  running and a link to its source: Ljós Studio, Eldur and Ljós Hof on
  the front page, Studio and Eldur on the showcase after the apps it
  records (Ljós Hof is one of those), and all three in every page's
  footer. Every picture is a capture of the real program; none is drawn
  for the site.

  Covered by site-ljos/tests/built-with.spec.js, Ljós Hof's showcase
  entry by site-ljos/tests/showcase.spec.js (every entry in
  bundle/Showcase/products.json), the pages' widths by
  site-ljos/tests/design.spec.js.

  Background:
    Given the site is built

  Scenario: The front page shows what is built with Ljós
    When a reader with no script opens the front page
    Then a section "Built with Ljós" has a card each for Ljós Studio, Eldur and Ljós Hof
    And each card's title links to its repository
    And each card has a capture of it running, as WebP with a PNG for a browser without, sized and fetched lazily
    And the section links to the showcase

  Scenario Outline: A capture is the reader's scheme's, where the program has one for each
    Given a reader whose browser prefers <scheme>
    When they open the front page
    Then Ljós Studio's and Ljós Hof's cards show their <scheme> captures
    And Eldur's, which has one, shows it in both

    Examples:
      | scheme |
      | light  |
      | dark   |

  Scenario: Ljós Hof stands in the showcase beside the Office
    When a reader with no script opens /showcase/
    Then Ljós Hof has a section after the Office's, with its recording, its captures and links to its source and repository

  Scenario: The showcase names the tools built with Ljós
    When a reader with no script opens /showcase/
    Then after the apps, a section "Tools built with Ljós" has cards for Ljós Studio and Eldur, each linking to its repository

  Scenario: Every page's footer names what is built with Ljós
    When a reader opens any page
    Then its footer links to Ljós Studio, Eldur and Ljós Hof at their repositories

  Scenario: The cards fit a phone and a desktop, in both schemes
    When the reader opens the front page at 390 and at 1440 pixels wide, light and dark
    Then nothing in the section is wider than the page
    And the cards stand one under another on the phone and side by side on the desktop
