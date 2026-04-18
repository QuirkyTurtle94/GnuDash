/**
 * Currency picker catalog for the new-book wizard.
 *
 * Intentionally not exhaustive — GnuCash recognises every ISO-4217 code, but
 * presenting 180 options in a dropdown is worse UX than offering a shortlist
 * and a "custom" escape hatch. The list below covers the common majors plus
 * a few regional currencies; users can type any ISO code and it's accepted
 * as-is (validated against /^[A-Z]{3}$/).
 *
 * The fullname is cosmetic (stored in `commodities.fullname`) — GnuCash
 * engines key off mnemonic + namespace "CURRENCY", so a typo in the fullname
 * won't break anything.
 */
export interface CurrencyOption {
  mnemonic: string;
  fullname: string;
}

export const COMMON_CURRENCIES: readonly CurrencyOption[] = [
  { mnemonic: "USD", fullname: "US Dollar" },
  { mnemonic: "EUR", fullname: "Euro" },
  { mnemonic: "GBP", fullname: "Pound Sterling" },
  { mnemonic: "JPY", fullname: "Japanese Yen" },
  { mnemonic: "CAD", fullname: "Canadian Dollar" },
  { mnemonic: "AUD", fullname: "Australian Dollar" },
  { mnemonic: "CHF", fullname: "Swiss Franc" },
  { mnemonic: "NZD", fullname: "New Zealand Dollar" },
  { mnemonic: "CNY", fullname: "Chinese Yuan" },
  { mnemonic: "HKD", fullname: "Hong Kong Dollar" },
  { mnemonic: "SGD", fullname: "Singapore Dollar" },
  { mnemonic: "INR", fullname: "Indian Rupee" },
  { mnemonic: "SEK", fullname: "Swedish Krona" },
  { mnemonic: "NOK", fullname: "Norwegian Krone" },
  { mnemonic: "DKK", fullname: "Danish Krone" },
  { mnemonic: "ZAR", fullname: "South African Rand" },
  { mnemonic: "MXN", fullname: "Mexican Peso" },
  { mnemonic: "BRL", fullname: "Brazilian Real" },
];

/** Lookup helper — returns the catalog entry for a mnemonic or null. */
export function findCurrency(mnemonic: string): CurrencyOption | null {
  const m = mnemonic.trim().toUpperCase();
  return COMMON_CURRENCIES.find((c) => c.mnemonic === m) ?? null;
}

/** True if `s` looks like a valid ISO 4217 currency code. */
export function isIsoCurrencyCode(s: string): boolean {
  return /^[A-Z]{3}$/.test(s.trim().toUpperCase());
}
