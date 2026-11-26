Feature: A page loads without moving
  A page is in its HTML before any script runs: the build prerenders it
  at a phone's size and a desktop's, in both schemes, with its text
  measured in a browser in the fonts the page shows. The page waits for
  those fonts (they are preloaded) before it takes over, and shows the
  page as written over the one it takes over until that is live. So
  nothing a reader sees moves as the page loads: no line laid out
  again, no column centred differently, no font swapped under it.

  Covered by site-ljos/e2e/steady.spec.js, and the prerender's sizes,
  schemes and measuring by packages/runtime/site-tests/pages.spec.js.

  Background:
    Given the built site

  Scenario Outline: Each line stays where the page as written put it
    Given a window <width> wide and <height> high
    When <page> opens with no script, and again with it until it is live
    Then every line of text in the window stands in the same place, at the same size, within 2 pixels

    Examples:
      | page        | width | height |
      | /           | 390   | 844    |
      | /           | 1440  | 900    |
      | /start/     | 390   | 844    |
      | /start/     | 1440  | 900    |
      | /showcase/  | 390   | 844    |
      | /showcase/  | 1440  | 900    |
      | /demos/     | 390   | 844    |
      | /demos/     | 1440  | 900    |

  Scenario: A desktop page's column is centred the same before and after it is live
    Given a window wider than the desktop render
    When a page opens with no script
    Then its column stands in the middle of the window, as it does once live
    And the page cannot be scrolled sideways

  Scenario: A docs page fills its window at every width
    Given a docs page in a window wider than the desktop render
    When it opens with no script
    Then its sidebar stands at the window's left edge, as it does once live

  Scenario: A page in the light shows only what the light scheme shows
    Given a page whose light and dark renders share one HTML
    When it opens with no script in the light scheme
    Then nothing only the dark scheme shows is drawn, and the reverse in the dark
