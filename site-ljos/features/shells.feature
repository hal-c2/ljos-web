Feature: The site is shown in a shell the reader picks
  The site's state (where the reader is, what they chose) and its pages
  are one thing; the shell that frames them is another, a QML file of
  its own in site-ljos/bundle/Shells/ that only says where each of the
  site's pieces goes. Four ship: Elegant, the one every page is
  written in and the one a reader with no script gets, a wide editorial
  page in one sans with the front page's replay beside its headline;
  Cyberpunk, a full-bleed console with a telemetry rail along its top,
  a nav rail down its left and the front page's live app as a mission
  console between its Observer tree and its agent's calls; Workbench, the
  pages on the left, the page in the middle and its Source on the right;
  and Desktop, a menu bar, a toolbar, the pages in a sidebar, routes as
  tabs and a status bar. A reader swaps them
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
      | /                  | elegant   | cyberpunk |
      | /                  | elegant   | workbench |
      | /                  | elegant   | desktop   |
      | /                  | cyberpunk | elegant   |
      | /                  | cyberpunk | workbench |
      | /                  | cyberpunk | desktop   |
      | /                  | workbench | elegant   |
      | /                  | workbench | cyberpunk |
      | /                  | workbench | desktop   |
      | /                  | desktop   | elegant   |
      | /                  | desktop   | cyberpunk |
      | /                  | desktop   | workbench |
      | /start/first-app/  | elegant   | cyberpunk |
      | /start/first-app/  | elegant   | workbench |
      | /start/first-app/  | elegant   | desktop   |
      | /start/first-app/  | cyberpunk | elegant   |
      | /start/first-app/  | cyberpunk | workbench |
      | /start/first-app/  | cyberpunk | desktop   |
      | /start/first-app/  | workbench | elegant   |
      | /start/first-app/  | workbench | cyberpunk |
      | /start/first-app/  | workbench | desktop   |
      | /start/first-app/  | desktop   | elegant   |
      | /start/first-app/  | desktop   | cyberpunk |
      | /start/first-app/  | desktop   | workbench |

  Scenario: Every kind of page stands in every shell
    When a reader opens the front page, the demos, a demo's own page and a docs page in each shell
    Then each is framed by that shell and shows its own page

  Scenario: A running example keeps its state across a swap
    Given a reader running the counter on "/start/first-app/"
    And they have pressed "Increment" twice, so it reads "Count: 2"
    When they swap to Cyberpunk, then to Workbench, then to Desktop, then back to Elegant
    Then the counter reads "Count: 2" in each

  Scenario: The reader's place on the page is kept across a swap
    Given a reader who has scrolled a docs page to a heading below the first screen
    When they swap to another shell
    Then that heading is still in view

  Scenario: The reader's place is kept when they swap just after scrolling
    Given a reader who stopped near the top of a docs page
    When they scroll to a heading below the first screen and swap to another shell at once
    Then that heading is still in view

  Scenario: The reader's place on the page is kept when the window narrows
    Given a reader at a desk's width who has scrolled the demos page to a demo far down it
    When they narrow the window, so everything above that demo is laid out again, shorter
    Then that demo's heading is still in view

  Scenario: The pick is kept, and a reload shows it without a jump
    Given a reader who picked the Desktop shell
    When they reload the page
    Then the page is framed by the Desktop shell
    And the page was not shown in the Elegant shell before it was

  Scenario Outline: A shell other than Elegant brings its own colours, and a page read in Elegant asks for none of them
    Given a reader on "/start/cli/" who <how> the Workbench shell
    Then the page's ground and text are the Workbench shell's
    And a page read in the Elegant shell carries no other shell's colours

    Examples:
      | how    |
      | picks  |
      | kept   |

  Scenario: A kept shell's page is never drawn in Elegant's colours while its own come
    Given a reader who kept the Workbench shell, on a connection where its colours come late
    When they open "/start/cli/"
    Then every frame drawn before the page is shown, or before the head's watchdog gives up on the shell, has the Workbench shell's ground

  Scenario: Colours that never come hold the page back no longer than the watchdog
    Given a reader who kept the Workbench shell, on a connection where its colours never come
    When they open "/start/cli/"
    Then the page is drawn once the head's watchdog shows it
    And the colours still on their way are dropped
    And the page stays in the Elegant shell's colours

  Scenario: Colours still on their way once the kept shell is shown hold the page back no longer than the watchdog
    Given a reader who kept the Workbench shell
    And its colours are still on their way when the Workbench shell is shown
    When they open "/start/cli/"
    Then the page is drawn once the head's watchdog's time is up
    And the page is not marked late
    And the page's ground is the Workbench shell's once its colours come

  Scenario Outline: Colours that failed to come are asked for once more
    Given a reader on "/start/cli/" who <how> the Workbench shell
    And its colours failed to come the first time they were asked for
    Then they are asked for once more
    And the page's ground is the Workbench shell's

    Examples:
      | how    |
      | picks  |
      | kept   |

  Scenario: A reload shows the kept shell without a jump in a browser with no view transitions
    Given a reader in a browser with no view transitions, who picked the Desktop shell
    And the Desktop shell is slow to come
    When they reload the page
    Then the page is framed by the Desktop shell
    And the page was not shown in the Elegant shell before it was

  Scenario: A kept shell that comes too late does not replace the page the reader sees
    Given a reader who picked the Desktop shell
    And the Desktop shell comes only after the page has been shown anyway
    When they reload the page
    Then the page is shown in the Elegant shell
    And it stays in the Elegant shell once the Desktop shell has come

  Scenario: A page taken over only after it was shown anyway stays in Elegant, and the kept shell is still the reader's to pick
    Given a reader who picked the Desktop shell
    And the page is taken over only after it has been shown anyway, as on a busy machine
    When they reload the page
    Then the page is shown in the Elegant shell
    And no frame of the Desktop shell is seen once it is taken over
    And picking the Desktop shell puts it in

  Scenario: A page shown anyway while the kept shell is being put in is seen at once
    Given a reader who picked the Desktop shell
    And the Desktop shell is slow to come
    When the page is shown anyway while the Desktop shell is being put in
    Then the page is seen a moment later, in the Elegant shell

  Scenario: A kept shell that comes while the page fades in does not replace it
    Given a reader who picked the Desktop shell
    And the Desktop shell comes while the page is being shown anyway
    When they reload the page
    Then it stays in the Elegant shell once the Desktop shell has come

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
    Then what it loads before a reader does anything holds no Cyberpunk, Workbench or Desktop shell
    And each of those comes the first time a reader picks it
    And the shell choices and a shell's source come the first time a reader opens them

  Scenario: The contents beside the page are written only where there is room for them
    Given a docs page with headings, as the build wrote it wide and narrow
    Then the wide page lists them beside it
    And the narrow page's hidden sidebar lists none, as the menu holds them there

  Scenario: A plain code card is written without a live block's parts
    Given a docs page whose code cards are all plain, as the build wrote it
    Then no card holds a live block's toolbar or stage
    And a page with a live block still writes that block's toolbar and stage

  Scenario: A page's first load stays within its ceiling
    Given any page the build wrote
    Then what it loads before a reader does anything is at most 400 kB gzip
    And its head holds none of the comments written for whoever edits the head
    And it loads no Binding type to follow the window's width

  Scenario: A reader with no script gets the Elegant shell
    Given a reader whose kept shell is Desktop
    When they open a page with no script
    Then the page is shown in the Elegant shell, as the build wrote it

  Scenario: A phone has one menu control, and the shells say why they wait
    Given a reader on a phone whose kept shell is Workbench
    When they open the front page
    Then the page is framed by the Elegant shell
    And its header has exactly one control besides the home link: "Menu"
    When they open the menu and the shell switcher in it
    Then it says Workbench and Desktop need a wider window, and that this one shows "Elegant"

  Scenario Outline: What a finger presses in a shell's phone header and menu is big enough
    Given a reader on a phone whose kept shell is <shell>
    When they open a docs page, its menu and the shell switcher in it
    Then each link, button, field and choice in the header, the menu and the switcher is at least 44 pixels high

    Examples:
      | shell     |
      | Elegant   |
      | Cyberpunk |

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
    When they choose "View this shell's QML"
    Then they see "Source of Shells/Workbench.qml", the file the site ships
    When they break it and press "Apply"
    Then the page is framed by the Elegant shell, still on their page
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
    And the icon takes the text colour of a shell the reader picks
    And no page's first load holds QtQuick.Shapes to draw it

  Scenario: The switcher lists every shell, each with a line that says what it is
    When a reader opens the shell switcher
    Then it lists Elegant, Cyberpunk, Workbench and Desktop, in that order
    And each is shown with one line about it

  Scenario: A pick kept under the shell's old name is read as Elegant
    Given a reader whose kept shell is "marketing", from before Elegant had its name
    When they open the front page
    Then the page is framed by the Elegant shell, and nothing was said of an error

  Scenario: Elegant sets its words in the site's own fonts
    When a reader opens the front page in the Elegant shell
    Then its headline is set in Inter, its body in Inter and its code in JetBrains Mono
    And each of those fonts is served by the site itself

  Scenario: The site ships only the fonts its faces name
    Then every font file in the site's fonts folder is named by an @font-face of the page or the other shells' stylesheet
    And the fonts README lists exactly those files

  Scenario: The site's buttons are set in its own type
    Given a reader in the Elegant shell
    When they open the shell switcher
    Then "View this shell's QML" is set in Inter
    When they press it
    Then "Apply" and "Reset" are set in Inter

  Scenario Outline: Elegant's front page opens on a headline beside a live app
    Given a reader with script at <width> wide, in <scheme>
    When they open the front page in the Elegant shell
    Then the headline is set at <least> to <most> pixels
    And the agent replay stands in the wash beside it, or under it on a phone
    And in the section on agents, a live app runs in a framed device with the tabs "Source", "Observer" and "Agent"
    And picking a tab shows what it names

    Examples:
      | width | scheme | least | most |
      | 1440  | light  | 56    | 72   |
      | 1440  | dark   | 56    | 72   |
      | 390   | light  | 36    | 40   |
      | 390   | dark   | 36    | 40   |

  Scenario Outline: The front page's replay stands beside its headline only with room for its code beside its app
    Given a reader at <width> wide who asked for less motion
    When they open the front page in the Elegant shell
    Then the agent replay stands <where> the headline
    And in the replay, the code stands beside the app

    Examples:
      | width | where  |
      | 1176  | under  |
      | 1200  | under  |
      | 1278  | under  |
      | 1279  | beside |
      | 1440  | beside |

  Scenario: The arrow keys walk the live app's tabs
    Given a reader on the front page who pressed the live app's "Source" tab
    When they press the right arrow twice
    Then "Agent" is chosen and has the focus
    And the right arrow stays on "Agent", and the left arrow walks back to "Source"

  Scenario: Tab goes from the live app's tabs into the panel chosen, and through a console's app first
    Given a reader on the front page who pressed the live app's "Agent" tab
    When they press Tab
    Then the focus is in the "Agent" panel
    Given a reader in the Cyberpunk shell at a desktop's width
    When they press the live app's first task
    Then it changes, so the panels beside the app never take its presses
    When they Tab to "Next step" in the "Agent MCP stream", then press Shift+Tab and Space
    Then the live app's last task changes, so the app comes before the agent's calls

  Scenario: Elegant lays a wide page out on a wide grid
    When a reader opens the front page at 1440 wide in the Elegant shell
    Then its content is at most 1280 pixels wide, centred
    And the sections after the hero put their demo on alternate sides

  Scenario: Elegant's sections rise in once, and with reduced motion only fade
    When a reader scrolls the front page in the Elegant shell
    Then each section rises into place the first time it is seen
    When a reader who asked for reduced motion does the same
    Then the sections fade in without moving

  Scenario: Cyberpunk's telemetry rail says where the reader is and what runs
    Given a reader with script at a desktop's width, in the Cyberpunk shell
    When they open "/start/first-app/"
    Then the rail along the top says "Route /start/first-app/"
    And it says the time as "Clock" with hours and minutes
    And it says how many objects are alive, the frame rate in fps and the renderer
    And the renderer is WebGPU, WebGL2 or Solid DOM, as the browser can run

  Scenario: Cyberpunk's nav rail goes to each part of the site
    Given a reader with script at a desktop's width, in the Cyberpunk shell
    When they open the front page
    Then a rail down the left lists "Console", "Demos", "Showcase", "Docs", "Shells" and "Source", numbered
    And "Console" is marked as where they are
    When they press "Demos"
    Then the demos page is shown and "Demos" is marked as where they are
    When they press "Showcase"
    Then the showcase is shown and "Showcase" is marked as where they are
    When they press "Source"
    Then they see "Source of Shells/Cyberpunk.qml"

  Scenario: Cyberpunk's front page is a mission console
    Given a reader with script at a desktop's width, in the Cyberpunk shell
    When they open the front page
    Then the live app under "Built for agents" stands between the "Observer tree" on its left and the "Agent MCP stream" on its right, all seen at once
    And its headline is in sentence case, never all capitals

  Scenario Outline: Cyberpunk's front page never stacks its words over a tabbed app
    Given a reader with script in a window <width> wide, in the Cyberpunk shell
    When they open the front page
    Then the live app under "Built for agents" is either a console or stands beside the section's words, never a tabbed app under them

    Examples:
      | width |
      | 1000  |
      | 1100  |
      | 1200  |
      | 1260  |
      | 1440  |

  Scenario: Cyberpunk stands on a phone, with one menu control and its telemetry at the bottom
    Given a reader on a phone whose kept shell is Cyberpunk
    When they open the front page
    Then the page is framed by the Cyberpunk shell
    And its header has exactly one control besides the home link: "Menu"
    And a bar along the bottom says the route, the objects alive, the frame rate and the clock

  Scenario: A phone never scrolls sideways while Cyberpunk glitches in
    Given a reader on a phone whose kept shell is Cyberpunk
    When they open the front page and it glitches in
    Then the page is never wider than the phone, in any frame of the glitch
    And once the glitch is over, the page no longer clips its width

  Scenario: Cyberpunk's scanlines hold still, and with reduced motion it never glitches
    When a reader swaps to the Cyberpunk shell
    Then the swap is a short glitch, and the shell lies under still scanlines
    When a reader who asked for reduced motion swaps to it
    Then the swap is a crossfade, and the scanlines are there and still

  Scenario: A reader who comes back to Cyberpunk sees it glitch in
    Given a reader whose kept shell is Cyberpunk
    When they open the front page
    Then the page glitches in as it is first shown
    When a reader who asked for reduced motion does the same
    Then it only fades in

  Scenario Outline: Cyberpunk's words stand out from what they are on
    Given a reader in the Cyberpunk shell, in <scheme>
    Then every text and background pair it draws meets WCAG AA

    Examples:
      | scheme |
      | light  |
      | dark   |

  Scenario: The logo is the same in every shell
    Given a reader has any shell, in light or dark, on a desktop or a phone
    When they look at the header and the footer
    Then the mark and "Ljós" are drawn as the user's logo
    And the shell's typeface, colours and capitals don't reach them

  Scenario: The search field's words stay in its box in every shell
    Given a reader on a desktop has any shell, Cyberpunk's narrow rail among them
    When they open a docs page
    Then the search field's "Search docs and demos" ends inside the field, shortened if it must be
    And where the field shows the "/" key, its words end before it
