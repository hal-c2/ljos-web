Feature: A reload keeps what was assigned unless the file's declaration changed
  A reload makes a new tree from the new file. A value the running
  program assigned is carried to it while the file says the same of
  that property as it said before. An edited declaration wins. A list
  or a plain object is the same declaration when it has the same
  content as it was declared with, whatever the app changed in it
  since, and though each load makes one of its own.

  Covered by packages/runtime/site-tests/reload.spec.js, in a build
  with no places and in builds that say where each binding is written
  (`inspect`).

  Background:
    Given a root mounted so that it can be reloaded

  Scenario: An assigned list or object survives an unchanged declaration
    Given a file declares "[]", "({})" or lists and objects nested in those
    When the app assigns the property and the same file is reloaded
    Then the property keeps what was assigned
    And it keeps it through the next reload as well

  Scenario: An edited literal wins
    When the app assigns the property and the file is reloaded with another literal
    Then the property has the file's literal

  Scenario: A literal edited to what the app had made of the old one still wins
    Given the app changed a declared list in place
    And then assigned the property
    When the file is edited to a list equal to the changed one
    Then the property has the file's list

  Scenario: An unchanged declaration with no assignment is the new object's own
    Given the app changed a declared list in place and assigned nothing
    When the same file is reloaded
    Then the property has a new list with the file's content

  Scenario: What is not plain data is the same only as itself
    Given a declared value that is a cycle, a class instance or holds a function or an accessor
    When a reload makes another that looks like it
    Then the file's value wins
    And the reload ends, throws nothing and runs no accessor

  Scenario: An object's keys and a list's holes are part of its content
    When an edit changes which keys an object has, their order, or which items a list has
    Then the file's value wins

  Scenario: An edit that only shifts a line keeps what was assigned
    Given the build says where each binding is written
    When lines are added above a declaration and nothing else of it changes
    Then the property keeps what was assigned
    But a declaration edited in the same save still wins
