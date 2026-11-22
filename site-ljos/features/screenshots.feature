Feature: Every deploy shows what it draws, beside what the last one drew
  Each deploy of the site draws every demo and every shell again, on
  each kernel (Solid's and the wasm one), with WebGPU and with WebGL 2
  for what draws on a GPU, in light and in dark, and puts the pictures
  on /screenshots/. Beside each picture is the one the deploy before
  drew. A picture that differs from it by more than the stated share
  of its pixels is marked changed, and the picture of what differs is
  one press away. A reader who sees something wrong reports it from the
  picture, with everything a maintainer needs already written. What is
  shot is read from the site's own lists (the pro demos' table, the
  shells, the demos page's own sections), so a new demo or shell is
  shot with no change to the scripts.

  Covered by site-ljos/tests/screenshots.spec.js (the page, against a
  manifest of its own), and by site-ljos/tests/shots.spec.js (what is
  shot, the diff and the health of a picture).

  Background:
    Given the built site, opened in a browser

  Scenario: The page says which deploy drew the pictures, and when
    Given the deploy's manifest names its commit, its date and the deploy before
    When a reader opens /screenshots/
    Then they see the commit as a link to it, and the date
    And the commit and date of the deploy compared with
    And how many pictures there are, how many changed and how many are broken

  Scenario: Each picture stands beside the one before
    When a reader opens /screenshots/
    Then each demo and shell has its pictures, each named by kernel, renderer, scheme and size
    And each picture that has one before shows both, the one before first

  Scenario: A changed picture is marked, and its difference is one press away
    Given a picture that differs from the one before by more than the threshold
    Then it is marked changed with the share of its pixels that differ, in words, not only in colour
    And it has a link to the picture of what differs

  Scenario: An intended change says why
    Given a pull request that lists a picture as changed on purpose, with its reason
    Then the picture is marked as an intended change, with that reason
    And pictures it lists as taken off on purpose have that reason said once, where the gone are counted
    But a listing with no reason, or with no list of pictures, is no pass and fails the check

  Scenario: Only what changed, on a press
    When a reader presses "Changed"
    Then only the changed pictures are shown, and the button says it is pressed
    When they press "All"
    Then every picture is shown again

  Scenario: Any picture opens full size
    When a reader presses a picture's "Full size"
    Then the picture is shown as large as the window allows, with a link to the image itself
    And Escape closes it and gives the keyboard back to the button that opened it

  Scenario: A bug is reported from the picture, never by the site
    Then each picture has a "Report a bug" link to a new issue on hal-c2/ljos-web
    And its title and body already name the picture, the commit, the renderer, the scheme and the image's address
    And pressing it only opens GitHub's form: nothing is filed until the reader files it

  Scenario: A deploy with no pictures yet says so
    Given a site with no manifest beside the page
    When a reader opens /screenshots/
    Then the page says the pictures are made by each deploy and none are here yet

  Scenario: The page is right in light and dark, wide and narrow
    When a reader opens /screenshots/ at 1440 and at 390 pixels wide, in light and in dark
    Then nothing runs past the edge of the window, and every text meets AA contrast

  Scenario: What is shot is read from the site's own lists
    Given the pro demos' table, the shells the site ships and the demos page
    Then there is a shot of each pro demo, of the front page in each shell, and of each section of the demos page
    And a demo that draws on a GPU is shot with WebGPU and with WebGL 2

  Scenario: Each picture says what drew it
    When a picture is taken
    Then it records the browser, its version and the adapter that drew it
    And its tile and its bug report say all three

  Scenario: A software adapter never passes for a real one
    Given a picture drawn by SwiftShader, or by an adapter that does not name a GPU
    Then it is not recorded as hardware, whatever renderer was asked for
    And the page says in words that it was not drawn on a known GPU, and how many were not
    And a capture that requires hardware fails on it

  Scenario: A blank or throwing render is broken
    Given a demo that draws a blank canvas, or throws as it runs
    Then its shot is marked broken, and the capture fails
    And a good build's shots are not
    And a page that shows none of the parts it is shot by fails the capture too

  Scenario: A picture that can't be compared never passes for an unchanged one
    Given a deploy before that has a picture of a demo
    When this deploy has none under that name, or the one before can't be read
    Then the check fails, unless a pull request named the missing one with its reason
    And a deploy with no pictures at all fails it
    And so does a list of pictures before that is there and can't be read

  Scenario: What moves on its own is checked that it drew, not compared
    Given a demo whose canvas draws a different frame each moment, as a turning 3D scene does
    When it is shot twice from the same build
    Then its canvas is left out of the comparison, and the rest of the picture still counts
    And the picture says its moving part was not compared
    And a canvas that holds still is compared whole

  Scenario: What tells the time is shot at the same moment every time
    Given a demo that shows the time and the date, as a watch face does
    When it is shot twice, a second apart, on machines in different time zones
    Then both pictures show the same time, date and time zone
    And the picture is compared whole
