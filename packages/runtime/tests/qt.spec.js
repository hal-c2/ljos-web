// What is expected here is what Qt 6.11 answers for the same QML (`qml6`,
// in UTC and American English).
import { test as base } from "@playwright/test";
import { expect, open, test } from "./open.js";

test.use({ timezoneId: "UTC", locale: "en-US" });
base.use({ timezoneId: "UTC", locale: "en-US" });

// What a function returns, or what it throws.
const answers = (page, work) =>
  page.evaluate(
    (source) => {
      const made = new Function("objects", `with (objects) { return (${source})(); }`)(window.objects);
      return made.map((each) => {
        try {
          const value = each();
          return value !== null && typeof value === "object" ? String(value) : value;
        } catch (error) {
          return `THROW ${error.message}`;
        }
      });
    },
    work.toString(),
  );

test("the Qt namespace's enums have Qt's numbers", async ({ page }) => {
  await open(page, "qt");
  expect(
    await answers(page, () => [
      () => Qt.AlignLeft,
      () => Qt.AlignHCenter,
      () => Qt.AlignVCenter,
      () => Qt.Alignment.AlignRight,
      () => Qt.Key_Return,
      () => Qt.Key_Escape,
      () => Qt.Key_A,
      () => Qt.LeftButton,
      () => Qt.RightButton,
      () => Qt.Horizontal,
      () => Qt.Vertical,
      () => Qt.ElideRight,
      () => Qt.PointingHandCursor,
      () => Qt.Checked,
      () => Qt.ControlModifier,
      () => Qt.LandscapeOrientation,
      () => Qt.ApplicationActive,
      () => Qt.RightToLeft,
      () => Qt.ISODate,
      () => Qt.Dark,
      () => Qt.Asynchronous,
      () => Component.Null,
      () => Component.Ready,
      () => Component.Loading,
      () => Component.Error,
    ]),
  ).toEqual([1, 4, 128, 2, 0x01000004, 0x01000000, 0x41, 1, 2, 1, 2, 1, 13, 2, 0x04000000, 2, 4, 1, 1, 2, 0, 0, 1, 2, 3]);
});

test("points, sizes, rectangles, vectors, quaternions and matrices are Qt's values", async ({ page }) => {
  await open(page, "qt");
  expect(
    await answers(page, () => {
      const m = Qt.matrix4x4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
      const r = Qt.rect(1, 2, 3, 4);
      const q = Qt.quaternion(1, 2, 3, 4);
      return [
        () => Qt.point(1.5, 2),
        () => Qt.size(3, 4.25),
        () => r,
        () => [r.left, r.right, r.top, r.bottom, r.x, r.width].join(),
        () => Qt.point(1),
        () => Qt.vector2d(1, 2).length(),
        () => Qt.vector3d(1, 2, 3).length(),
        () => Qt.vector3d(1, 2, 3).crossProduct(Qt.vector3d(4, 5, 6)),
        () => Qt.vector3d(1, 2, 3).normalized(),
        () => Qt.vector3d(1, 2, 3).dotProduct(Qt.vector3d(4, 5, 6)),
        () => Qt.vector4d(1, 2, 3, 4).length(),
        () => q,
        () => q.toEulerAngles(),
        () => q.times(Qt.quaternion(1, 0, 1, 0)),
        () => q.times(Qt.vector3d(1, 2, 3)),
        () => Qt.matrix4x4(),
        () => m.times(m),
        () => m.times(Qt.vector4d(1, 2, 3, 4)),
        () => m.times(Qt.vector3d(1, 2, 3)),
        () => m.row(1),
        () => m.column(1),
        () => m.m23,
        () => Qt.matrix4x4(2, 0, 0, 5, 0, 2, 0, 6, 0, 0, 2, 7, 0, 0, 0, 1).inverted(),
        () => Qt.matrix4x4(2, 0, 0, 5, 0, 2, 0, 6, 0, 0, 2, 7, 0, 0, 0, 1).map(Qt.point(1, 1)),
        () => Qt.matrix4x4(2, 0, 0, 5, 0, 2, 0, 6, 0, 0, 2, 7, 0, 0, 0, 1).mapRect(Qt.rect(1, 1, 2, 2)),
        () => {
          const turned = Qt.matrix4x4();
          turned.rotate(90, Qt.vector3d(0, 0, 1));
          return turned;
        },
        () => Qt.matrix4x4(1, 2),
      ];
    }),
  ).toEqual([
    "QPointF(1.5, 2)",
    "QSizeF(3, 4.25)",
    "QRectF(1, 2, 3, 4)",
    "1,4,2,6,1,3",
    "THROW Insufficient arguments",
    2.2360680103302,
    3.741657257080078,
    "QVector3D(-3, 6, -3)",
    "QVector3D(0.267261, 0.534522, 0.801784)",
    32,
    5.4772257804870605,
    "QQuaternion(1, 2, 3, 4)",
    "QVector3D(-41.8103, 79.6951, 116.565)",
    "QQuaternion(-2, -2, 4, 6)",
    "QVector3D(54, 60, 78)",
    "QMatrix4x4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)",
    "QMatrix4x4(90, 100, 110, 120, 202, 228, 254, 280, 314, 356, 398, 440, 426, 484, 542, 600)",
    "QVector4D(30, 70, 110, 150)",
    "QVector3D(0.176471, 0.45098, 0.72549)",
    "QVector4D(5, 6, 7, 8)",
    "QVector4D(2, 6, 10, 14)",
    7,
    "QMatrix4x4(0.5, 0, 0, -2.5, 0, 0.5, 0, -3, 0, 0, 0.5, -3.5, 0, 0, 0, 1)",
    "QPointF(7, 8)",
    "QRectF(7, 8, 4, 4)",
    "QMatrix4x4(0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)",
    "THROW Too many arguments",
  ]);
});

test("arg fills the lowest marker, and qsTr the count", async ({ page }) => {
  await open(page, "qt");
  expect(
    await answers(page, () => [
      () => qsTr("hello %1 and %2").arg("a").arg(3),
      () => "%2 %1 %1".arg("a"),
      () => "x".arg("x", "y"),
      () => "x".arg(),
      () => "%1%2".arg(1.5).arg(true),
      () => "%L1".arg(1234.5),
      () => "%1 %10".arg("a"),
      () => "%3 %2".arg("a").arg("b"),
      () => "%1 %1 %2".arg("%2").arg("z"),
      () => "%0 %1".arg("q"),
      () => "%99 %100".arg("q"),
      () => "%1".arg(0.1 + 0.2),
      () => "%1".arg(1e21),
      () => "%1".arg(1 / 3),
      () => "%1".arg(100000000),
      () => "%1".arg(1234567.891),
      () => qsTr("n %n", "", 3),
      () => qsTr("%n %Ln", "", 12345),
      () => qsTrId("id %n", 4),
      () => qsTranslate("c", "x %n y", "", 2),
      () => QT_TR_NOOP("noop") + QT_TRANSLATE_NOOP("ctx", "noop2") + QT_TRID_NOOP("id3"),
      // Nothing a `for in` over a string or a prototype would meet.
      () => Object.keys(String.prototype).length + Object.keys(Date.prototype).length + Object.keys(Number.prototype).length,
      () => root.label,
      () => {
        root.count = 7;
        return root.label;
      },
    ]),
  ).toEqual([
    "hello a and 3",
    "%2 a a",
    "THROW String.arg(): Invalid arguments",
    "THROW String.arg(): Invalid arguments",
    "1.51",
    "1,234.5",
    "a %10",
    "b a",
    "z z z",
    "q %1",
    "%99 q0",
    "0.3",
    "1e+21",
    "0.333333",
    "100000000",
    "1.23457e+06",
    "n 3",
    "12345 12,345",
    "id 4",
    "x 2 y",
    "noopnoop2id3",
    0,
    "1 of 2",
    "1 of 7",
  ]);
});

test("dates are written in Qt's formats", async ({ page }) => {
  await open(page, "qt");
  expect(
    await answers(page, () => {
      const d = new Date(2024, 0, 5, 7, 8, 9, 45);
      const e = new Date(2023, 10, 23, 15, 4, 0, 500);
      const de = Qt.locale("de_DE");
      return [
        () => Qt.formatDateTime(d, "d dd ddd dddd"),
        () => Qt.formatDateTime(d, "yy yyyy y yyy yyyyy"),
        () => Qt.formatDateTime(d, "z zz zzz zzzz"),
        () => Qt.formatDateTime(e, "z zz zzz zzzz"),
        () => Qt.formatDateTime(e, "hh:mm:ss AP"),
        () => Qt.formatDateTime(e, "H:m ap"),
        () => Qt.formatDateTime(d, "hh 'o''clock' ap"),
        () => Qt.formatDateTime(d, "ddddd MMMMM hhh mmm sss Hh"),
        () => Qt.formatDate(d, "hh:mm dd"),
        () => Qt.formatTime(d, "hh:mm dd yyyy"),
        () => Qt.formatDate(d),
        () => Qt.formatTime(d),
        () => Qt.formatDateTime(d),
        () => Qt.formatDateTime(d, Qt.TextDate),
        () => Qt.formatDate(d, Qt.TextDate),
        () => Qt.formatTime(d, Qt.TextDate),
        () => Qt.formatDateTime(d, Qt.ISODate),
        () => Qt.formatDateTime(d, Qt.ISODateWithMs),
        () => Qt.formatDateTime(d, Qt.RFC2822Date),
        () => Qt.formatDateTime(d, de, Locale.ShortFormat),
        () => Qt.formatDateTime(d, de, Locale.LongFormat),
        () => Qt.formatDateTime("2024-01-05T07:08:09", "dd.MM.yyyy hh:mm"),
        () => Qt.formatDateTime("nonsense", "dd"),
        () => Qt.formatDateTime(new Date(NaN), "dd"),
      ];
    }),
  ).toEqual([
    "5 05 Fri Friday",
    "24 2024 y 24y 2024y",
    "045 045 045 045045",
    "5 5 500 5005",
    "03:04:00 PM",
    "15:4 pm",
    "07 o'clock am",
    "Friday5 January1 077 088 099 77",
    "hh:mm 05",
    "07:08 dd yyyy",
    "1/5/24",
    "7:08 AM",
    "1/5/24 7:08 AM",
    "Fri Jan 5 07:08:09 2024",
    "Fri Jan 5 2024",
    "07:08:09",
    "2024-01-05T07:08:09",
    "2024-01-05T07:08:09.045",
    "05 Jan 2024 07:08:09 +0000",
    "05.01.24 07:08",
    "Freitag, 5. Januar 2024 07:08:09 Koordinierte Weltzeit",
    "05.01.2024 07:08",
    "THROW Invalid argument passed to formatDateTime(): nonsense",
    "",
  ]);
});

test("a locale says how its people write dates and numbers", async ({ page }) => {
  await open(page, "qt");
  expect(
    await answers(page, () => {
      const d = new Date(2024, 0, 5, 7, 8, 9, 45);
      const en = Qt.locale("en_US");
      const de = Qt.locale("de_DE");
      return [
        () => en.dateFormat(),
        () => en.dateFormat(Locale.ShortFormat),
        () => en.timeFormat(),
        () => en.timeFormat(Locale.ShortFormat),
        () => en.monthName(11, Locale.ShortFormat),
        () => en.dayName(7),
        () => en.toString(1234567.891),
        () => en.toString(1234567.891, "f", 2),
        () => en.toString(123456),
        () => en.toString(123456.5),
        () => en.toString(1234.5, "e"),
        () => en.toString(1234.5, "f"),
        () => de.dateFormat(),
        () => de.dateFormat(Locale.ShortFormat),
        () => de.toString(1234567.891, "f", 2),
        () => de.monthName(11, Locale.ShortFormat),
        () => de.dayName(1, Locale.ShortFormat),
        () => (1234567.891).toLocaleString(de),
        () => Number.fromLocaleString(de, "1.234,5"),
        () => Number.fromLocaleString(en, "abc"),
        // A number where a locale goes is no locale: Qt writes the short form.
        () => d.toLocaleDateString(Locale.LongFormat),
        // And given nothing, the long one.
        () => d.toLocaleDateString(),
        () => d.toLocaleString(de, "dd MMM"),
        () => {
          const read = Date.fromLocaleString(en, "1/5/24 7:08 AM", Locale.ShortFormat);
          return [read.getFullYear(), read.getMonth(), read.getDate(), read.getHours(), read.getMinutes()].join();
        },
        () => Qt.locale("nonsense").name,
        () => Qt.locale("de").name,
        () => Qt.locale().name,
        () => de.decimalPoint + de.groupSeparator + de.firstDayOfWeek + en.firstDayOfWeek + en.measurementSystem,
        // What the browser's own do without a locale is left to the browser.
        () => (1234.5).toLocaleString("de-DE"),
      ];
    }),
  ).toEqual([
    "dddd, MMMM d, yyyy",
    "M/d/yy",
    "h:mm:ss Ap tttt",
    "h:mm Ap",
    "Dec",
    "Sunday",
    "1.23457e+06",
    "1,234,567.89",
    "123,456",
    "123,457",
    "1.234500e+03",
    "1,234.500000",
    "dddd, d. MMMM yyyy",
    "dd.MM.yy",
    "1.234.567,89",
    "Dez.",
    "Mo.",
    "1.234.567,89",
    1234.5,
    "THROW Locale: Number.fromLocaleString(): Invalid format",
    "1/5/24",
    "Friday, January 5, 2024",
    "05 Jan.",
    "1924,0,5,7,8",
    "C",
    "de_DE",
    "en_US",
    ",.101",
    "1.234,5",
  ]);
});

test("a locale writes money as its books do", async ({ page }) => {
  await open(page, "qt");
  expect(
    await answers(page, () => {
      const en = Qt.locale("en_US");
      const de = Qt.locale("de_DE");
      const ja = Qt.locale("ja_JP");
      const ch = Qt.locale("de_CH");
      const es = Qt.locale("es_ES");
      const c = Qt.locale("C");
      return [
        // Without a locale no currency is written at all.
        () => (1234.5).toLocaleCurrencyString(),
        () => (1234567).toLocaleCurrencyString(),
        () => (1234.5).toLocaleCurrencyString(en),
        () => (-1234.567).toLocaleCurrencyString(en),
        () => (1234.5).toLocaleCurrencyString(de),
        () => (-1234.567).toLocaleCurrencyString(de),
        () => (-1234.567).toLocaleCurrencyString(Qt.locale("fr_FR")),
        () => (1234.5).toLocaleCurrencyString(ja),
        () => (-2.5).toLocaleCurrencyString(ja),
        () => (-0.4).toLocaleCurrencyString(ja),
        // A debt that is not bracketed has its sign on the number.
        () => (-1234.567).toLocaleCurrencyString(Qt.locale("hi_IN")),
        () => (-1234.567).toLocaleCurrencyString(Qt.locale("pt_BR")),
        () => (-1234.567).toLocaleCurrencyString(Qt.locale("sv_SE")),
        () => (-1234.567).toLocaleCurrencyString(Qt.locale("nb_NO")),
        () => (-1234.567).toLocaleCurrencyString(Qt.locale("ar_EG")),
        () => (1234.567).toLocaleCurrencyString(Qt.locale("ar_BH")),
        () => (-5).toLocaleCurrencyString(ch),
        () => (-1234.567).toLocaleCurrencyString(c),
        // Another sign for the currency's, and its code for none.
        () => (0.5).toLocaleCurrencyString(en, "X$"),
        () => (0.5).toLocaleCurrencyString(de, "X$"),
        () => (0.5).toLocaleCurrencyString(ch, "X$"),
        () => (0.5).toLocaleCurrencyString(Qt.locale("ar_EG"), "X$"),
        () => (0.5).toLocaleCurrencyString(c, "X$"),
        () => (-5).toLocaleCurrencyString(en, ""),
        () => (-5).toLocaleCurrencyString(de, ""),
        // Rounded as the number is, which is not as it is written.
        () => [0.005, 0.015, 0.025, 1.005, -0.001, -0, NaN, -Infinity, 1e21].map((each) => each.toLocaleCurrencyString(en)).join(" "),
        () => [NaN, -Infinity, -0.001].map((each) => each.toLocaleCurrencyString(de)).join(" "),
        () => (1).toLocaleCurrencyString("en_US"),
        () => (1).toLocaleCurrencyString(en, "kr", 2),
        () => (1).toLocaleCurrencyString(en, 5),
        () => [en, de, ch, ja, c].map((each) => each.currencySymbol()).join(),
        () => [en, de, ch, ja, c].map((each) => each.currencySymbol(Locale.CurrencyIsoCode)).join(),
        () => [en, de, ch, ja, c].map((each) => each.currencySymbol(Locale.CurrencyDisplayName)).join(),
        () => en.currencySymbol(7),
        () => Qt.locale("hu_HU").currencySymbol(Locale.CurrencyIsoCode) + (1234.5).toLocaleCurrencyString(Qt.locale("hu_HU")),
        // Four digits stand together where the locale has them so.
        () => (1234.5).toLocaleString(es) + " " + (12345.5).toLocaleString(es),
        () => en.toString(1e21, "f", 2),
        () => Qt.locale("ar_EG").negativeSign + Qt.locale("ar_EG").percent + Qt.locale("he_IL").positiveSign,
      ];
    }),
  ).toEqual([
    "1,234.5",
    "1.23457e+06",
    "$1,234.50",
    "($1,234.57)",
    "1.234,50\u00a0€",
    "-1.234,57\u00a0€",
    "(1\u202f234,57\u00a0€)",
    "￥1,235",
    "(￥3)",
    "(￥0)",
    "₹-1,234.57",
    "R$\u00a0-1.234,57",
    "\u22121\u00a0234,57\u00a0kr",
    "(kr\u00a01\u00a0234,57)",
    "\u200f\u061c-١٬٢٣٤٫٥٧\u00a0ج.م.\u200f",
    "\u200f١٬٢٣٤٫٥٦٧\u00a0د.ب.\u200f",
    "CHF-5.00",
    "-1234.57",
    "X$0.50",
    "0,50\u00a0X$",
    "X$\u00a00.50",
    "\u200f٠٫٥٠\u00a0X$",
    "0.50X$",
    "(USD5.00)",
    "-5,00\u00a0EUR",
    "$0.01 $0.01 $0.03 $1.00 ($0.00) $0.00 ($nan) ($inf) $1,000,000,000,000,000,000,000.00",
    "nan\u00a0€ -inf\u00a0€ -0,00\u00a0€",
    "THROW Locale: Number.toLocaleCurrencyString(): Invalid arguments",
    "THROW Locale: Number.toLocaleCurrencyString(): Invalid arguments",
    "THROW Locale: Number.toLocaleString(): Invalid arguments",
    "$,€,,￥,",
    "USD,EUR,CHF,JPY,",
    "US Dollar,Euro,Schweizer Franken,日本円,",
    "",
    "HUF1235\u00a0Ft",
    "1234,50 12.345,50",
    "1,000,000,000,000,000,000,000.00",
    "\u061c-٪\u061c\u200e+",
  ]);
});

test("the helpers on Qt answer as Qt's do", async ({ page }) => {
  await open(page, "qt");
  expect(
    await answers(page, () => [
      () => Qt.md5("hello"),
      () => Qt.md5(""),
      () => Qt.md5("héllo €"),
      () => Qt.btoa("hello"),
      () => Qt.btoa("héllo €"),
      () => Qt.atob("aMOpbGxvIOKCrA=="),
      () => Qt.atob("!!!"),
      () => JSON.stringify(Qt.platform),
      () => Qt.isQtObject(root),
      () => Qt.isQtObject(Qt.application),
      () => Qt.isQtObject(Qt.point(1, 2)),
      () => Qt.isQtObject(undefined),
      () => {
        const made = Qt.font({ family: "Arial", pointSize: 12, bold: true });
        return [made.family, made.weight, made.pixelSize, made.bold].join();
      },
      () => {
        const made = Qt.font({ pixelSize: 20, weight: 700, italic: true });
        return [made.family, made.pointSize, made.bold, made.italic].join();
      },
      () => Qt.font({ nonsense: 1 }),
      () => Qt.font("x"),
      () => Qt.url("a/b.png"),
      // Resolved where it is used, by the property that takes it.
      () => Qt.resolvedUrl("a/b.png"),
      () => Qt.resolvedUrl("a/b.png", "http://x/y/z.qml"),
      () => Qt.binding(3),
      () => typeof print + typeof gc + gc(),
    ]),
  ).toEqual([
    "5d41402abc4b2a76b9719d911017c592",
    "d41d8cd98f00b204e9800998ecf8427e",
    "6a1950b864488746748ba6312d3ce712",
    "aGVsbG8=",
    "aMOpbGxvIOKCrA==",
    "héllo €",
    "",
    '{"os":"wasm","pluginName":"wasm"}',
    true,
    true,
    false,
    false,
    "Arial,700,16,true",
    "Sans Serif,15,true,true",
    "THROW Qt.font(): Invalid argument: no valid font subproperties specified",
    "THROW Qt.font(): Invalid arguments",
    "a/b.png",
    "a/b.png",
    "http://x/y/a/b.png",
    "THROW binding(): argument (binding expression) must be a function",
    "functionfunctionundefined",
  ]);
});

test("assigning Qt.binding binds the property again", async ({ page }) => {
  await open(page, "qt");
  expect(
    await answers(page, () => [
      () => {
        follower.width = Qt.binding(function () {
          return bar.width * 2 + this.height;
        });
        return follower.width;
      },
      () => {
        bar.width = 30;
        return follower.width;
      },
      // An assignment replaces that binding like any other.
      () => {
        follower.width = 5;
        bar.width = 40;
        return follower.width;
      },
      // A declared property takes one too.
      () => {
        root.count = Qt.binding(() => bar.width);
        return root.label;
      },
      () => {
        bar.width = 50;
        return root.count;
      },
    ]),
  ).toEqual([30, 70, 5, "1 of 40", 50]);
  expect((await page.evaluate(() => window.objects.follower.$node.getBoundingClientRect())).width).toBe(5);
});

test("the application is the page, and quitting is said, not done", async ({ page }) => {
  await open(page, "qt");
  expect(
    await answers(page, () => [
      () => Qt.application === Qt.application,
      () => Application.name + Application.displayName + Application.version,
      () => Application.font.family,
      () => Application.font.pixelSize,
      () => Application.arguments.length,
      () => Application.state === Qt.application.state,
      () => Application.layoutDirection,
      () => Application.styleHints === Qt.styleHints,
      () => Qt.styleHints.mouseDoubleClickInterval,
      () => Qt.styleHints.startDragDistance,
      () => Qt.styleHints.colorScheme,
      () => Qt.inputMethod.visible,
      () => {
        const log = [];
        const app = Qt.application;
        app.aboutToQuit.connect(() => log.push("about"));
        app.quit.connect(() => log.push("quit"));
        app.exit.connect((code) => log.push(`exit ${code}`));
        Qt.quit();
        Qt.exit(3);
        return log.join();
      },
    ]),
  ).toEqual([true, "", "Sans Serif", 12, 0, true, 0, true, 400, 10, 1, false, "about,quit,about,exit 3"]);

  // The scheme is the browser's, and follows it.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => window.objects.Qt.styleHints.colorScheme === window.objects.Qt.Dark);
});

test("callLater calls once, with the last arguments", async ({ page }) => {
  await open(page, "qt");
  const log = await page.evaluate(async () => {
    const { Qt } = window.objects;
    const log = [];
    const note = (value) => log.push(value);
    Qt.callLater(note, 1);
    Qt.callLater(note, 2);
    log.push("before");
    await Promise.resolve();
    return log;
  });
  expect(log).toEqual(["before", 2]);
});

test("settings are kept in the page's storage, as text", async ({ page }) => {
  await open(page, "settings");
  const stored = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).sort()));
  // What the QML says is stored when nothing was.
  expect(await stored()).toEqual({
    "ljos-web:count": '"10"',
    "ljos-web:main/count": '"1"',
    "ljos-web:main/flag": '"true"',
    "ljos-web:main/list": '["1","2"]',
    "ljos-web:main/name": '"n"',
    "ljos-web:main/ratio": '"1.5"',
  });
  expect(
    await answers(page, () => {
      st.count = 4;
      st.name = "changed";
      st.flag = false;
      return [
        () => st.count,
        // Written since the page loaded: as it was written.
        () => st.value("count"),
        () => st.value("missing", 7),
        () => st.value("missing"),
        () => st.setValue("extra", 5),
        () => st.value("extra"),
        () => other.count,
        () => LabsSettings === Settings,
        () => st.category,
        () => st.location,
      ];
    }),
  ).toEqual([4, 4, 7, undefined, undefined, 5, 10, true, "main", ""]);
  expect(await stored()).toMatchObject({
    "ljos-web:main/count": '"4"',
    "ljos-web:main/name": '"changed"',
    "ljos-web:main/flag": '"false"',
    "ljos-web:main/extra": '"5"',
    "ljos-web:count": '"10"',
  });

  // The next run of the program: what was stored replaces what the QML says,
  // as the kind of thing the property holds.
  await open(page, "settings");
  expect(
    await answers(page, () => [
      () => st.count,
      () => st.name,
      () => st.flag,
      () => st.ratio,
      () => JSON.stringify(st.list),
      () => other.count,
      // Read from storage: as text, which is how Qt keeps it.
      () => st.value("count"),
      () => st.value("flag"),
      () => st.value("ratio"),
      () => st.value("extra"),
      () => st.value("list").join(),
    ]),
  ).toEqual([4, "changed", false, 1.5, '["1","2"]', 10, "4", "false", "1.5", "5", "1,2"]);

  // The application's name and the settings' location say which settings.
  expect(
    await answers(page, () => {
      Application.organization = "Org";
      Application.name = "App";
      return [() => st.value("count"), () => (st.location = "elsewhere"), () => st.value("count", "none"), () => st.sync(), () => st.value("count")];
    }),
  ).toEqual([undefined, "elsewhere", "none", undefined, 4]);
  expect(await page.evaluate(() => localStorage.getItem("ljos-web:elsewhere/Org/App/main/count"))).toBe('"4"');
});

test("a page has no standard paths", async ({ page }) => {
  await open(page, "settings");
  expect(
    await answers(page, () => [
      () => StandardPaths.DesktopLocation,
      () => StandardPaths.PicturesLocation,
      () => StandardPaths.AppDataLocation,
      () => StandardPaths.GenericStateLocation,
      () => StandardPaths.LocateDirectory,
      () => StandardPaths.writableLocation(StandardPaths.PicturesLocation),
      () => StandardPaths.standardLocations(StandardPaths.PicturesLocation).length,
      () => StandardPaths.locate(StandardPaths.HomeLocation, "file"),
    ]),
  ).toEqual([0, 6, 17, 22, 1, "", 0, ""]);
});

// These warn, which the scenes' `test` takes for a failure.
base("creating a component from a file at run time is refused aloud", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await open(page, "qt");
  const made = await page.evaluate(() => {
    const { Qt, root } = window.objects;
    return [Qt.createComponent("Other.qml"), Qt.createQmlObject("import QtQuick; Item {}", root)];
  });
  expect(made).toEqual([null, null]);
  expect(warnings).toEqual([
    'Qt.createComponent("Other.qml"): QML is compiled ahead of time; declare a Component instead',
    "Qt.createQmlObject(): QML is compiled ahead of time; declare a Component instead",
  ]);
});

test("an XMLHttpRequest drops the headers no program may set, and says nothing", async ({ page }) => {
  await open(page, "request");
  await expect.poll(() => page.evaluate(() => window.scene.status)).toBe(200);
  expect(await page.evaluate(() => window.scene.got)).toBe("what was asked for");
});
