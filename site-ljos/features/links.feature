Feature: The site's links are the page's own links
  Every page of the site is prerendered, and every way the site offers
  to go somewhere (the header, the docs' sidebar, the page before and
  after, the front page's calls to action and its words) is an `a`
  with the address it goes to, at the base the site was built for.
  A reader with no script follows them, a crawler finds every page
  through them, and a middle press or a press with a modifier opens
  one in a new tab. With script, a plain press shows the page in the
  page already open, keeping the address and the history.

  Covered by site-ljos/tests/links.spec.js, and for any item whose
  role is a link by packages/runtime/tests/links.spec.js and the
  prerender test in packages/runtime/site-tests/prerender.spec.js.

  Background:
    Given the site is built for a base, "/" or "/ljos-web/"

  Scenario: The header names every section with a link
    When a reader with no script opens any page
    Then the header has a link to the front page, to the docs and to the live demos
    And each link's address starts at the base

  Scenario: Every page names its icon at the base
    When any built page is read as HTML
    Then its head links the site's icon at the base, which the build wrote

  Scenario: Every link of the site goes to a page the build wrote
    When every built page is read as HTML, with no script
    Then every address on it inside the base names a page the build wrote

  Scenario: The front page leads to the docs and the demos
    When a reader with no script opens the front page
    Then it links to the docs' first page, to the first app and to the live demos

  Scenario: A docs page leads on
    When a reader with no script opens a docs page that is neither the first nor the last
    Then it links to the page before it and the page after it, in the sidebar's order

  Scenario: Without script, a link is followed and the way back is the browser's
    Given a reader with no script on the front page
    When they press "What is Ljós?"
    Then they are on the docs' first page
    When they go back
    Then they are on the front page

  Scenario: With script, a plain press shows the page in place
    Given a reader on the front page with script
    When they press "Docs" in the header
    Then the address is the docs' first page and its title is the tab's
    And the page was not loaded again
    When they go back
    Then the front page is shown, and the page was still not loaded again

  Scenario: A middle press opens a new tab
    Given a reader on the front page with script
    When they middle-press "Docs" in the header
    Then a new tab opens on the docs' first page
    And the front page stays where it was

  Scenario: An address the site has no page for
    When a reader asks for an address inside the base that names no page
    Then the server answers 404 with the site's own page for it
    And that page has the header, says the page was not found, and links to the front page
    And every address on it starts at the base, whatever depth it was served at
