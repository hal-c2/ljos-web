Feature: The showcase shows apps built with Ljós, recorded as they run
  The showcase (/showcase/) is one section per app built with Ljós: a
  recording of the app running, three captures that each say what they
  show about Ljós, and links to the app's source. The apps are data
  (site-ljos/bundle/Showcase/products.json), with their recordings and
  captures beside them, so a new app is a new entry and its files. Every
  picture is a capture of the real app; none is drawn for the site.

  Covered by site-ljos/tests/showcase.spec.js, with the route in
  links.spec.js, parity.spec.js, hydrate.spec.js, a11y.spec.js and
  design.spec.js, and the rich text's <picture> by
  packages/runtime/tests/text.spec.js.

  Background:
    Given the site is built

  Scenario: Every page leads to the showcase
    When a reader with no script opens any page
    Then the header, the phone's menu and the 404 page each have a link "Showcase" to /showcase/

  Scenario: Each app is shown as it runs, before any script does
    When a reader with no script opens /showcase/
    Then each app has a heading, its words and a poster of its recording
    And the poster offers AVIF and WebP, with a PNG for a browser with neither, at its own size
    And each of its three captures is sized, fetched lazily, and says what it shows about Ljós
    And it links to the app's source and its repository

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

  Scenario: The showcase fits a phone and a desktop, in both schemes
    When the reader opens /showcase/ at 390 and at 1440 pixels wide, light and dark
    Then nothing is wider than the page
    And the captures stand one under another on the phone and side by side on the desktop
