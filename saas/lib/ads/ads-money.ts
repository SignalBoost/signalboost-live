// saas/lib/ads/ads-money.ts
//
// Money normalisation for the paid-advertising surface.
//
// WHY THIS FILE EXISTS. The declaration layer requires every ad network to state the units it
// reports spend in, because guessing is catastrophic rather than merely wrong. But the two
// values it currently accepts — 'minor' and 'major' — do not cover the social ad networks:
// X Ads, Reddit Ads, Pinterest Ads and Snapchat Ads all report in MICRO units, one millionth
// of a major unit. Reading micro as major understates spend a millionfold; as minor, ten
// thousandfold. Both errors point the same direction: the buyer believes they have spent
// almost nothing while the platform bills them in full.
//
// SECOND TRAP, less obvious and more likely to bite in practice: "minor units" is not always
// hundredths. Japanese yen and Korean won have no minor unit at all, and Kuwaiti dinar and
// Bahraini dinar have three decimal places. A conversion that hardcodes 100 is off by 100x
// for a Tokyo ad account and 10x for a Kuwait one. Every buyer of this portable who runs a
// non-Western ad account hits this on day one.
//
// NO FLOATING POINT ANYWHERE IN THIS FILE. Amounts arrive as strings from providers and are
// converted by digit manipulation, not arithmetic on Number. A float that has been through
// a division has already lost the exactness that makes a spend figure worth recording.
//
// ROUNDING DIRECTION IS DELIBERATE: spend rounds UP to the next minor unit. Understating
// spend is the only rounding error that can hurt the buyer, so it is the one we refuse to
// make. A tenth of a cent of overstatement per reconciliation is not a real cost; a
// systematically low spend figure against a cap is.
//
// TYPE NOTE, LEARNED THE HARD WAY ON THIS FILE. The public result type is a discriminated
// union, because that is the right shape for a buyer compiling under `strict`. But this
// repo's tsconfig is NOT strict, and without strictNullChecks TypeScript does not narrow a
// union by the truthiness of its boolean discriminant — `if (!result.ok) throw
// new Error(result.reason)` fails to compile with "Property 'reason' does not exist".
// So nothing inside this file narrows anything: all internal work happens on one flat shape,
// and the union is constructed only at the moment of return. Any future edit here should
// keep that arrangement rather than reintroduce narrowing that compiles on a strict machine
// and fails in CI.

export type SpendUnits = 'minor' | 'major' | 'micro';

export type MoneySuccess = { ok: true; minor: number; currency: string; roundedUp: boolean };
export type MoneyFailure = { ok: false; reason: string };
export type MoneyResult = MoneySuccess | MoneyFailure;

// The flat internal shape. Never exported — see the type note above.
interface Conversion {
  ok: boolean;
  minor: number;
  currency: string;
  roundedUp: boolean;
  reason: string;
}

// Currencies whose minor unit is not one hundredth. Everything absent from this table is
// treated as two decimal places, which is correct for the large majority.
const CURRENCY_EXPONENTS: Record<string, number> = {
  // No minor unit at all.
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // Three decimal places.
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};

const DEFAULT_EXPONENT = 2;

// Above this many digits a value can no longer be held exactly as a Number. Refusing is the
// right response: a spend figure we cannot represent exactly is not a spend figure.
const MAX_SAFE_DIGITS = 15;

/**
 * Decimal places in the currency's minor unit. Unknown codes fall back to 2, which is the
 * common case; the fallback is safe because it is applied consistently in both directions.
 */
export function currencyExponent(currency: string): number {
  const code = normaliseCurrency(currency);
  if (!code) return DEFAULT_EXPONENT;
  const exponent = CURRENCY_EXPONENTS[code];
  return exponent === undefined ? DEFAULT_EXPONENT : exponent;
}

/**
 * Convert a provider-reported amount into integer minor units.
 *
 * `raw` is whatever the provider returned, kept as a string wherever possible. `units` must
 * be stated by the declaration — this function will not infer it, because the whole point is
 * that inference is the failure mode.
 */
export function toMinorUnits(raw: string | number, units: SpendUnits, currency: string): MoneyResult {
  const result = convert(raw, units, currency);
  if (result.ok) {
    return { ok: true, minor: result.minor, currency: result.currency, roundedUp: result.roundedUp };
  }
  return { ok: false, reason: result.reason };
}

/**
 * Throwing form, for registration-time and gate paths where a bad value must stop the call
 * rather than be handled. The message is the same either way.
 */
export function assertMinorUnits(raw: string | number, units: SpendUnits, currency: string): number {
  const result = convert(raw, units, currency);
  if (!result.ok) throw new Error(result.reason);
  return result.minor;
}

/**
 * Display form for the cockpit and the digest. Not for arithmetic — anything that needs to
 * compare or accumulate works in minor units.
 */
export function formatMinor(minor: number, currency: string): string {
  const normalised = normaliseCurrency(currency);
  const code = normalised || String(currency == null ? '' : currency).toUpperCase();
  const exponent = currencyExponent(code);
  if (!Number.isFinite(minor)) return `— ${code}`;
  const negative = minor < 0;
  const digits = String(Math.abs(Math.trunc(minor))).padStart(exponent + 1, '0');
  const whole = exponent === 0 ? digits : digits.slice(0, digits.length - exponent);
  const fraction = exponent === 0 ? '' : `.${digits.slice(digits.length - exponent)}`;
  return `${negative ? '-' : ''}${groupThousands(whole)}${fraction} ${code}`;
}

/**
 * True when the reported spend has passed the cap. Kept here so every caller applies the
 * same comparison, and expressed as a plain integer comparison because both sides are
 * already exact minor units.
 */
export function isOverCap(reportedMinor: number, capMinor: number): boolean {
  return Number.isFinite(reportedMinor) && Number.isFinite(capMinor) && reportedMinor > capMinor;
}

// ---------------------------------------------------------------------------
// Internals — string arithmetic only, and no narrowing.
// ---------------------------------------------------------------------------

function convert(raw: string | number, units: SpendUnits, currency: string): Conversion {
  const code = normaliseCurrency(currency);
  if (!code) {
    return fail(`Currency "${currency}" is not a three-letter ISO 4217 code. Refusing to convert money against an unknown currency.`);
  }

  const text = typeof raw === 'number'
    ? numberToPlainString(raw)
    : String(raw == null ? '' : raw).trim();

  if (!text) {
    return fail('Provider reported an empty spend value. An empty figure is not zero — it means the report could not be read.');
  }
  if (/^-?\d+(\.\d+)?[eE][-+]?\d+$/.test(text)) {
    return fail(`Provider reported "${text}" in exponent form. Refusing to interpret it — a spend value written as an exponent has already been through a float.`);
  }

  const cleaned = stripThousandsSeparators(text);
  if (cleaned === null) {
    return fail(`Provider reported "${text}", which is not a plain decimal number. It may be localised or carry a currency symbol; the declaration should point at a raw numeric field.`);
  }
  if (cleaned.charAt(0) === '-') {
    return fail(`Provider reported negative spend ("${text}"). Refunds and adjustments are not spend and must not be netted off a cap silently.`);
  }

  const exponent = currencyExponent(code);

  if (units === 'minor') {
    if (cleaned.indexOf('.') !== -1) {
      return fail(`Provider reported a fractional minor unit ("${text}"). A fractional cent means someone did floating-point maths on money upstream.`);
    }
    return finish(cleaned, false, code);
  }

  // Micro is simply a major amount with the decimal point six places from the right, so it
  // reuses the major path rather than getting its own arithmetic to be wrong in.
  let decimalText = cleaned;
  if (units === 'micro') {
    if (cleaned.indexOf('.') !== -1) {
      return fail(`Provider reported fractional micro units ("${text}"). Micro units are already a millionth; a fraction of one means the value was computed, not reported.`);
    }
    decimalText = insertDecimalFromRight(cleaned, 6);
  }

  return shiftToMinor(decimalText, exponent, code, text);
}

function shiftToMinor(decimalText: string, exponent: number, code: string, original: string): Conversion {
  const parts = decimalText.split('.');
  const wholePart = parts[0] || '';
  const fractionPart = parts.length > 1 ? parts[1] : '';
  if (!/^\d*$/.test(wholePart) || !/^\d*$/.test(fractionPart)) {
    return fail(`Provider reported "${original}", which is not a plain decimal number.`);
  }

  const kept = fractionPart.slice(0, exponent).padEnd(exponent, '0');
  const discarded = fractionPart.slice(exponent);
  // Any discarded digit that is not zero means real money is being dropped. Round up rather
  // than truncate — see the rounding note in the file header.
  const roundUp = /[1-9]/.test(discarded);

  return finish(`${wholePart}${kept}`, roundUp, code);
}

function finish(digits: string, roundUp: boolean, code: string): Conversion {
  const trimmed = stripLeadingZeros(digits);
  if (trimmed.length > MAX_SAFE_DIGITS) {
    return fail(`Spend value has ${trimmed.length} digits, beyond the range that can be held exactly. Refusing rather than reporting an approximate amount of money.`);
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    return fail('Spend value could not be represented exactly as an integer number of minor units.');
  }
  return {
    ok: true,
    minor: roundUp ? value + 1 : value,
    currency: code,
    roundedUp: roundUp,
    reason: '',
  };
}

function fail(reason: string): Conversion {
  return { ok: false, minor: 0, currency: '', roundedUp: false, reason };
}

function normaliseCurrency(currency: string): string {
  const code = String(currency == null ? '' : currency).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

function stripThousandsSeparators(text: string): string | null {
  if (/^-?\d+(\.\d+)?$/.test(text)) return text;
  // Accept a well-formed grouped number ("1,234,567.89") and nothing else. Anything looser
  // risks reading a decimal comma as a group separator, which is a hundredfold error.
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) return text.replace(/,/g, '');
  return null;
}

function insertDecimalFromRight(digits: string, places: number): string {
  const padded = digits.padStart(places + 1, '0');
  const cut = padded.length - places;
  return `${padded.slice(0, cut)}.${padded.slice(cut)}`;
}

function stripLeadingZeros(digits: string): string {
  const trimmed = digits.replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) return '';
  // A Number that is already fractional has been through a float; the caller is told so by
  // the fractional-minor-unit refusal rather than having it silently rounded here.
  return String(value);
}
