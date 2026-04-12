const CURRENCY_LOCALE_MAP: Record<string, string> = {
  GBP: "en-GB",
  USD: "en-US",
  EUR: "de-DE",
  CAD: "en-CA",
  AUD: "en-AU",
  JPY: "ja-JP",
  CHF: "de-CH",
};

export function formatCurrency(
  value: number,
  currency: string,
  options?: { compact?: boolean; decimals?: number }
): string {
  const locale = CURRENCY_LOCALE_MAP[currency] ?? "en-GB";

  if (options?.compact) {
    if (Math.abs(value) >= 1_000_000) {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
    }
    if (Math.abs(value) >= 1_000) {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 0,
      }).format(value);
    }
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: options?.decimals ?? 2,
    maximumFractionDigits: options?.decimals ?? 2,
  }).format(value);
}

export function formatCurrencyShort(value: number, currency: string): string {
  return formatCurrency(value, currency, { compact: true });
}

/** Known ISO 4217 currency codes (common subset). */
const KNOWN_CURRENCIES = new Set([
  "AED","AFN","ALL","AMD","ANG","AOA","ARS","AUD","AWG","AZN","BAM","BBD","BDT","BGN","BHD","BIF",
  "BMD","BND","BOB","BRL","BSD","BTN","BWP","BYN","BZD","CAD","CDF","CHF","CLP","CNY","COP","CRC",
  "CUP","CVE","CZK","DJF","DKK","DOP","DZD","EGP","ERN","ETB","EUR","FJD","FKP","GBP","GEL","GHS",
  "GIP","GMD","GNF","GTQ","GYD","HKD","HNL","HRK","HTG","HUF","IDR","ILS","INR","IQD","IRR","ISK",
  "JMD","JOD","JPY","KES","KGS","KHR","KMF","KPW","KRW","KWD","KYD","KZT","LAK","LBP","LKR","LRD",
  "LSL","LYD","MAD","MDL","MGA","MKD","MMK","MNT","MOP","MRU","MUR","MVR","MWK","MXN","MYR","MZN",
  "NAD","NGN","NIO","NOK","NPR","NZD","OMR","PAB","PEN","PGK","PHP","PKR","PLN","PYG","QAR","RON",
  "RSD","RUB","RWF","SAR","SBD","SCR","SDG","SEK","SGD","SHP","SLE","SOS","SRD","SSP","STN","SVC",
  "SYP","SZL","THB","TJS","TMT","TND","TOP","TRY","TTD","TWD","TZS","UAH","UGX","USD","UYU","UZS",
  "VES","VND","VUV","WST","XAF","XCD","XOF","XPF","YER","ZAR","ZMW","ZWL",
]);

/**
 * Format a value with its commodity. For recognized currencies, uses Intl currency formatting.
 * For stocks/tickers, formats as a plain number with the ticker appended.
 */
export function formatAmount(value: number, commodity: string, decimals?: number): string {
  if (KNOWN_CURRENCIES.has(commodity)) {
    return formatCurrency(value, commodity, { decimals: decimals ?? 2 });
  }
  // Non-currency commodity (stock ticker etc.) — show all significant figures
  const d = decimals ?? significantDecimals(value);
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: Math.min(d, 2),
    maximumFractionDigits: Math.max(d, 2),
  }).format(value);
  return `${formatted} ${commodity}`;
}

/** Count meaningful decimal places in a number (up to 6). */
function significantDecimals(n: number): number {
  if (Number.isInteger(n)) return 0;
  const s = String(Math.abs(n));
  const dot = s.indexOf(".");
  if (dot === -1) return 0;
  // Trim trailing zeros
  const dec = s.slice(dot + 1).replace(/0+$/, "");
  return Math.min(dec.length, 6);
}
