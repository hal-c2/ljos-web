Feature: The showcase shows apps built with Ljós, recorded as they run
  The showcase (/showcase/) is one section per app built with Ljós: a
  recording of the app running, three captures that each say what they
  show about Ljós, and links to the app's source. The apps are data
  (site-ljos/bundle/Showcase/products.json), with their recordings and
  captures beside them, so a new app is a new entry and its files. Every
  picture is a capture of the real app; none is drawn for the site.

  Covered by site-ljos/tests/showcase.spec.js, with the route in
  links.spec.js, parity.spec.js, hydrate.spec.js, a11y.spec.js and
  design.spec.js, the first load by payload.spec.js, and the rich text's
  <picture> by packages/runtime/tests/text.spec.js. The example that runs
  in the page is covered by site-ljos/e2e/showcase-play.spec.js.

  Background:
    Given the site is built

  Scenario: Every page leads to the showcase
    When a reader with no script opens any page
    Then the header, the phone's menu and the 404 page each have a link "Showcase" to /showcase/

  Scenario: Search finds the showcase
    When a reader searches for "Built with"
    Then the results list "Built with Ljós", which leads to /showcase/

  Scenario: Each app is shown as it runs, before any script does
    When a reader with no script opens /showcase/
    Then each app has a heading, its words and a poster of its recording
    And the poster offers AVIF and WebP, with a PNG for a browser with neither, at its own size
    And each of its three captures is sized, fetched lazily, and says what it shows about Ljós
    And it links to the app's source and its repository

  Scenario: An app names the engine it is built on
    Given an app whose entry names an engine, as the Office names ljos-play
    When a reader with no script opens /showcase/
    Then the app's section says it runs on that engine, in a line of its own
    And it links to the engine's repository

  Scenario: The engine is shown in its own words, with its source
    Given an app whose engine has an example
    When a reader with no script opens /showcase/
    Then the section shows lines of the example's own file, coloured as code
    And the lines are the file's at the commit the entry names, byte for byte
    And each links to those lines at that commit
    And beside them is a capture of the example running, made off-screen

  Scenario: The engine's example runs in the page once the reader asks
    Given an app whose engine has an example that runs in a browser, as ljos-play's Snail Post does
    When a reader opens /showcase/
    Then the example's capture stands in a frame with a control named "Run Snail Post"
    And nothing of the example is fetched: not its QML, its engine or its files
    When the reader presses Run
    Then the example is made in the page from the files the build copied, and the capture stays until it is drawn
    And its snails walk, fetch letters and carry them to the boxes

  Scenario: The example is copied from its engine, pinned, with its licence
    Given the example and the engine's QML it needs, copied by scripts/sync-play.mjs
    Then each copy is the file at the commit the entry names, as the pin's hashes say
    And the engine's licence is beside them, and nothing else is in its folder

  Scenario: The example runs only while it is seen
    Given the example is running
    When the reader scrolls it out of view, or hides its tab
    Then its world's clock stands still
    And it goes on once it is shown again

  Scenario: Under reduced motion the snails go slower and never stop
    Given a browser that asks for reduced motion
    When the reader runs the example
    Then its snails move at less than their own pace, and still move

  Scenario: The reader changes the example and it runs as they changed it
    Given the example is running
    When the reader presses "Edit Snail Post"
    Then its Main.qml is shown in place of the lines beside the world, or under the world on a phone
    When the reader changes it
    Then the edit is compiled in the page and the world is made again from it
    And an edit that does not compile says what broke, and the last world that did goes on
    And "Reset" gives back the file as it was copied

  Scenario: Without WebAssembly an edit says why it cannot run
    Given a browser without WebAssembly
    And the example is running
    When the reader edits its Main.qml
    Then the page says that live editing needs WebAssembly
    And the world goes on as the file made it

  Scenario: No other page loads the showcase
    When a reader opens any page but /showcase/
    Then its first load holds none of the showcase: not the page, its apps' data or what names its pictures
    And /showcase/ is written with all of them, and waits for them before it is taken over

  Scenario: The recording plays, muted and looping, where the reader allows motion
    Given a browser that allows motion
    When the reader opens /showcase/
    Then each app's recording plays over its poster, muted and looping, and fades in
    And a control named "Pause the recording of" the app pauses it

  Scenario: Under reduced motion the poster stays until the reader plays it
    Given a browser that asks for reduced motion
    When the reader opens /showcase/
    Then the poster stays and nothing plays
    And a control named "Play the recording of" the app plays it, fading in over the poster

  Scenario: A recording runs only while it is seen
    Given a recording is playing
    When the reader scrolls it out of view
    Then it pauses
    And it plays again once it is back in view

  Scenario: A recording is fetched once it would be seen
    Given a browser that allows motion
    And a recording's frame below the window, or the page in a hidden tab
    When the reader opens /showcase/
    Then that recording isn't fetched
    And it is fetched and plays once the frame and the tab are shown

  Scenario: A recording waits while its tab is hidden
    Given a recording is playing
    When the reader hides its tab
    Then it pauses
    And it plays again once the tab is shown

  Scenario: A browser without WebM is given the MP4
    Given a browser that plays no WebM
    When the reader opens /showcase/
    Then each recording's source is its MP4

  Scenario: Text makes room for its pictures as they arrive
    Given rich text with a picture that states no size
    When the picture arrives, be it fetched lazily or one of two with the same fallback
    Then the text is measured again around it

  Scenario: A picture asks only for the file the browser takes
    Given rich text with a picture whose source the browser can show
    When the text is made
    Then its img is given its loading, then its address, where nothing loads
    And the picture's fallback isn't fetched

  Scenario: Text follows a picture back to an earlier file
    Given rich text with a picture whose source is for a narrow window
    When the window goes from narrow to wide and back
    Then the text is as tall as the file shown each time, and then measuring rests

  Scenario: Text follows a picture that changes density and keeps its file
    Given rich text with a picture whose sizes are larger in a wide window
    When the window goes from narrow to wide and back
    Then the text is as tall as the picture at each density, and then measuring rests

  Scenario: Text makes room for a picture the browser picks late
    Given rich text with a picture that states no size
    And a browser that picks its source after the text is measured
    When the picture arrives, or the text changes after it has
    Then the text is as tall as the picture at the density it was picked at

  Scenario: A picture keeps the size its source states for itself
    Given rich text with a source that has a width descriptor and sizes
    When the picture arrives
    Then it is as wide as its sizes say

  Scenario: The phone's menu gives way to the page it opened
    Given the phone's menu is open
    When the reader chooses a page in it
    Then that page is shown and the menu is shut

  Scenario: The showcase fits a phone and a desktop, in both schemes
    When the reader opens /showcase/ at 390 and at 1440 pixels wide, light and dark
    Then nothing is wider than the page
    And the captures stand one under another on the phone and side by side on the desktop
