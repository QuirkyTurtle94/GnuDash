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
