/**
 * Types for the "Start fresh" book templates surfaced in the new-book wizard.
 *
 * A template describes a chart-of-accounts skeleton — names, types, and
 * placeholder flags — in a tree form. The wizard turns a chosen template
 * into real `accounts` rows by walking the tree depth-first and assigning
 * parents as it recurses.
 */
import type { AccountType } from "../engine/types";

export interface TemplateAccount {
  /** Display name for the account. Must be unique within its parent. */
  name: string;
  /** GnuCash account type. Placeholders use a concrete type (e.g. ASSET). */
  type: AccountType;
  /** Grouping account — cannot have transactions. Default false. */
  placeholder?: boolean;
  /** Optional long-form description copied into the `description` column. */
  description?: string;
  /** Child accounts, recursive. */
  children?: TemplateAccount[];
}

export interface AccountTemplate {
  /** Stable identifier used by the wizard UI to pick a template. */
  id: string;
  /** Human-readable name shown in the picker. */
  name: string;
  /** One-line summary shown under the name in the picker. */
  description: string;
  /** Top-level accounts — typically Assets, Liabilities, Income, Expenses, Equity. */
  accounts: TemplateAccount[];
}
