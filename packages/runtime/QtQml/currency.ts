// What money a territory pays with, and how small its change is.
//
// The browser can write an amount of any currency, but not say which one a
// country uses, and it counts decimals as ISO 4217 does where Qt counts them
// as CLDR does (no forint has had a fillér since 1999). Both tables are read
// off Qt 6.11's locales.
const USED =
  "AED AE|AFN AF|ALL AL|AMD AM|AOA AO|ARS AR|AUD AU CX KI NF NR|AWG AW|AZN AZ|BAM BA|BBD BB|BDT BD|BHD BH|BIF BI|BMD BM|BND BN|BOB BO|BRL BR|BSD BS|" +
  "BTN BT|BWP BW|BYN BY|BZD BZ|CAD CA|CDF CD|CHF CH LI|CLP CL|CNY CN|COP CO|CRC CR|CUP CU|CVE CV|CZK CZ|DJF DJ|DKK DK FO GL|DOP DO|DZD DZ|EGP EG|ERN ER|" +
  "ETB ET|EUR AD AT AX BE BG BL CY DE EA EE ES FI FR GF GP GR HR IC IE IT LT LU LV MC ME MF MQ MT NL PM PT RE SI SK SM VA XK YT|FJD FJ|FKP FK|" +
  "GBP GB GG GS IM JE|GEL GE|GHS GH|GIP GI|GMD GM|GNF GN|GTQ GT|GYD GY|HKD HK|HNL HN|HTG HT|HUF HU|IDR ID|ILS IL PS|INR IN|IQD IQ|IRR IR|ISK IS|JMD JM|" +
  "JOD JO|JPY JP|KES KE|KGS KG|KHR KH|KMF KM|KPW KP|KRW KR|KWD KW|KYD KY|KZT KZ|LAK LA|LBP LB|LKR LK|LRD LR|LYD LY|MAD EH MA|MDL MD|MGA MG|MKD MK|MMK MM|" +
  "MNT MN|MOP MO|MRU MR|MUR MU|MVR MV|MWK MW|MXN MX|MYR MY|MZN MZ|NAD NA|NGN NG|NIO NI|NOK NO SJ|NPR NP|NZD CK NU NZ PN|OMR OM|PAB PA|PEN PE|PGK PG|" +
  "PHP PH|PKR PK|PLN PL|PYG PY|QAR QA|RON RO|RSD RS|RUB RU|RWF RW|SAR SA|SBD SB|SCR SC|SDG SD|SEK SE|SGD SG|SHP SH|SLE SL|SOS SO|SRD SR|SSP SS|STN ST|" +
  "SYP SY|SZL SZ|THB TH|TJS TJ|TMT TM|TND TN|TOP TO|TRY TR|TTD TT|TWD TW|TZS TZ|UAH UA|UGX UG|USD DG EC FM GU IO MH MP PR SV TC TL UM US VG VI|UYU UY|" +
  "UZS UZ|VES VE|VND VN|XAF CF CG CM GA GQ TD|XCD AG AI DM GD KN LC MS VC|XCG CW SX|XOF BF BJ CI GW ML NE SN TG|XPF NC PF WF|YER YE|ZAR LS ZA|ZMW ZM|" +
  "ZWG ZW";

const WHOLE = "AFN ALL BIF CLP COP DJF GNF HUF IDR IQD IRR ISK JPY KMF KPW KRW LAK LBP MGA MMK PKR PYG RWF SOS SYP UGX VND XAF XOF XPF YER";
const THOUSANDTHS = "BHD JOD KWD LYD OMR TND";

let currencies: Map<string, string> | undefined;

// The ISO 4217 code of a territory's currency: "" where Qt knows none.
export function currencyOf(territory: string): string {
  if (!currencies) {
    currencies = new Map();
    for (const row of USED.split("|")) {
      const [code, ...territories] = row.split(" ");
      for (const each of territories) currencies.set(each, code!);
    }
  }
  return currencies.get(territory) ?? "";
}

// How many decimals an amount of it is written with.
export const decimalsOf = (code: string): number => (WHOLE.includes(code) ? 0 : THOUSANDTHS.includes(code) ? 3 : 2);
