Feature: The site's QML is written in Ljós's dialect
  The site shows what Ljós is, so its own QML reads as a Ljós app does:
  Ljos.Ui, Ljos.Layout and Ljos.Core, t`` for the words a reader sees,
  and the styled Ljos.Controls. A file kept on a Qt module is named,
  with what keeps it there, and that list is the record of what Ljós
  does not cover yet.

  Covered by site-ljos/tests/dialect.spec.js, over site-ljos/bundle and
  site/src/demos.

  Scenario: A file on QtQuick is one named with its reason
    Given the QML files of the site and of its demos
    When a file imports QtQuick, QtQuick.Controls or QtQuick.Effects
    Then the file is on that module's list, with what keeps it there
    And every file on a list still imports that module

  Scenario: The modules Ljós replaces outright are gone
    Given the QML files of the site and of its demos
    Then none imports QtQuick.Layouts, QtQuick.Shapes or QtQml
    And none says qsTr
    And none imports Ljos.Controls.Basic
