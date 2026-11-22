Feature: The site is shown in a shell the reader picks
  The site's state (where the reader is, what they chose) and its pages
  are one thing; the shell that frames them is another, a QML file of
  its own in site-ljos/bundle/Shells/ that only says where each of the
  site's pieces goes. Three ship: Marketing, the one every page is
  written in and the one a reader with no script gets; Workbench, the
  pages on the left, the page in the middle and its Source on the
  right; and Desktop, a menu bar, a toolbar, the pages in a sidebar,
  routes as tabs and a status bar. A reader swaps them
  live, and keeps their page, their place on it and what they did in
  an example on it.

  Covered by site-ljos/tests/shells.spec.js, and the first load by
  site-ljos/tests/payload.spec.js.

  Background:
    Given the built site, served at its base

  Scenario Outline: A reader swaps from one shell to another and stays on their page
    Given a reader with script on <route> at a desktop's width, in the <from> shell
    When they pick the <to> shell from the shell switcher
    Then the page is framed by the <to> shell
    And the page they were on is still shown, and nothing was said of an error

    Examples:
      | route              | from      | to        |
      | /                  | marketing | workbench |
      | /                  | marketing | desktop   |
      | /                  | workbench | marketing |
      | /                  | workbench | desktop   |
      | /                  | desktop   | marketing |
      | /                  | desktop   | workbench |
      | /start/first-app/  | marketing | workbench |
      | /start/first-app/  | marketing | desktop   |
      | /start/first-app/  | workbench | marketing |
      | /start/first-app/  | workbench | desktop   |
      | /start/first-app/  | desktop   | marketing |
      | /start/first-app/  | desktop   | workbench |

  Scenario: Every kind of page stands in every shell
    When a reader opens the front page, the demos, a demo's own page and a docs page in each shell
    Then each is framed by that shell and shows its own page

  Scenario: A running example keeps its state across a swap
    Given a reader running the counter on "/start/first-app/"
    And they have pressed "Increment" twice, so it reads "Count: 2"
    When they swap to Workbench, then to Desktop, then back to Marketing
    Then the counter reads "Count: 2" in each

  Scenario: The reader's place on the page is kept across a swap
    Given a reader who has scrolled a docs page to a heading below the first screen
    When they swap to another shell
    Then that heading is still in view

  Scenario: The reader's place on the page is kept when the window narrows
    Given a reader at a desk's width who has scrolled the demos page to a demo far down it
    When they narrow the window, so everything above that demo is laid out again, shorter
    Then that demo's heading is still in view

  Scenario: The pick is kept, and a reload shows it without a jump
    Given a reader who picked the Desktop shell
    When they reload the page
    Then the page is framed by the Desktop shell
    And the page was not shown in the Marketing shell before it was

  Scenario: A reload shows the kept shell without a jump in a browser with no view transitions
    Given a reader in a browser with no view transitions, who picked the Desktop shell
    And the Desktop shell is slow to come
    When they reload the page
    Then the page is framed by the Desktop shell
    And the page was not shown in the Marketing shell before it was

  Scenario: A kept shell that comes too late does not replace the page the reader sees
    Given a reader who picked the Desktop shell
    And the Desktop shell comes only after the page has been shown anyway
    When they reload the page
    Then the page is shown in the Marketing shell
    And it stays in the Marketing shell once the Desktop shell has come

  Scenario: A page shown anyway while the kept shell is being put in is seen at once
    Given a reader who picked the Desktop shell
    And the Desktop shell is slow to come
    When the page is shown anyway while the Desktop shell is being put in
    Then the page is seen a moment later, in the Marketing shell

  Scenario: A kept shell that comes while the page fades in does not replace it
    Given a reader who picked the Desktop shell
    And the Desktop shell comes while the page is being shown anyway
    When they reload the page
    Then it stays in the Marketing shell once the Desktop shell has come

  Scenario: The Desktop shell keeps every page the reader opened as a tab
    Given a reader in the Desktop shell on "/start/first-app/"
    When they go to another docs page
    Then both pages are open as tabs

  Scenario: The shell choices come on a later press when the first could not load them
    Given a reader whose first press on the shell switcher could not load the choices
    When they press it again
    Then the shell choices are shown

  Scenario: Each shell's source shows that shell's own QML, and keeps the reader's edits to each
    Given a reader who edited the Workbench shell's source and closed it
    When they swap to the Desktop shell and view this shell's source
    Then they see the Desktop shell's own QML, without their edit
    When they swap back to the Workbench shell and view its source
    Then they see their edit again

  Scenario: A page's first load carries only the shell it is written in
    Given any page the build wrote
    Then what it loads before a reader does anything holds no Workbench or Desktop shell
    And each of those comes the first time a reader picks it
    And the shell choices and a shell's source come the first time a reader opens them

  Scenario: The contents beside the page are written only where there is room for them
    Given a docs page with headings, as the build wrote it wide and narrow
    Then the wide page lists them beside it
    And the narrow page's hidden sidebar lists none, as the menu holds them there

  Scenario: A reader with no script gets the Marketing shell
    Given a reader whose kept shell is Desktop
    When they open a page with no script
    Then the page is shown in the Marketing shell, as the build wrote it

  Scenario: A phone has one menu control, and the shells say why they wait
    Given a reader on a phone whose kept shell is Workbench
    When they open the front page
    Then the page is framed by the Marketing shell
    And its header has exactly one control besides the home link: "Menu"
    When they open the menu and the shell switcher in it
    Then it says Workbench and Desktop need a wider window

  Scenario: The header is the Ljós landmark in every shell
    Given a reader has any shell, on a desktop or a phone
    When their screen reader lists the page's landmarks
    Then the header shown is one named "Ljós", with the link home in it
    And in the Desktop shell the toolbar is in it too

  Scenario Outline: A kept shell gives a reader all axe asks
    Given a reader who kept the <shell> shell, in light or dark
    When they open the front page, a docs page or the demos at a desktop's width
    Then the page is framed by that shell
    And axe finds nothing to say of it

    Examples:
      | shell     |
      | workbench |
      | desktop   |

  Scenario: The Desktop shell's buttons are centred in their bars
    Given a reader in the Desktop shell, at 1000, 1100 or 1440 wide
    Then File, View, Go and Help are centred in the menu bar
    And Back, Forward and Home are centred in the toolbar

  Scenario: The Workbench offers only what it can show
    Given a reader in the Workbench shell
    Then one landmark is named "Pages"
    And the panel on the right is the page's Source
    And no tab offers an Observer or an Agent

  Scenario: A swap moves, or with reduced motion crossfades
    When a reader swaps the shell
    Then the swap is a transition that moves the next shell into place
    When a reader who asked for reduced motion swaps the shell
    Then the swap is a crossfade, and never a cut

  Scenario: The shell's own QML is shown, and one the reader breaks falls back
    Given a reader in the Workbench shell
    When they choose "View this shell's source"
    Then they see "Shells/Workbench.qml", the file the site ships
    When they break it and press "Apply"
    Then the page is framed by the Marketing shell, still on their page
    And the source says what broke
    When they press "Reset"
    Then the page is framed by the Workbench shell again

  Scenario: The Observer follows a shell that moves the page
    Given a reader in a shell they wrote, with the Observer docked beside a running example
    When that shell moves the page's place across and down, at the same size
    Then the Observer stands from the page's new top, as tall as the page
    And the page still ends where the Observer starts

  Scenario: The header names the source with an icon
    When a reader opens any page at a desktop's width
    Then the header has a link "Ljós on GitHub" to https://github.com/hal-c2/ljos-ui, drawn as an icon
    And the icon is in the text colour of the scheme the page is shown in, with script or none
    And no page's first load holds QtQuick.Shapes to draw it

  Scenario: The logo is the same in every shell
    Given a reader has any shell, in light or dark, on a desktop or a phone
    When they look at the header and the footer
    Then the mark and "Ljós" are drawn as the user's logo
    And the shell's typeface, colours and capitals don't reach them
