/**
 * Built-in chart-of-accounts templates for the "Start fresh" book wizard.
 *
 * Structured as plain data so adding a template is a matter of appending a
 * new `AccountTemplate` here — no wiring changes required. The wizard picker
 * iterates `TEMPLATES` in order, so this file's ordering doubles as the
 * display order.
 */
import type { AccountTemplate } from "./types";

/**
 * Bare minimum GnuCash top-level tree. Gives the user the five canonical
 * roots and nothing more — a sensible starting point for people who want to
 * build their own chart without deleting a bunch of pre-seeded accounts.
 */
const MINIMAL: AccountTemplate = {
  id: "minimal",
  name: "Minimal",
  description: "Just the five top-level accounts — build the rest yourself.",
  accounts: [
    { name: "Assets", type: "ASSET", placeholder: true },
    { name: "Liabilities", type: "LIABILITY", placeholder: true },
    { name: "Income", type: "INCOME", placeholder: true },
    { name: "Expenses", type: "EXPENSE", placeholder: true },
    { name: "Equity", type: "EQUITY", placeholder: true },
  ],
};

/**
 * Everyday personal-finance chart. Covers current/savings/cash, common
 * expense categories, and standard income sources. Mirrors what GnuCash
 * desktop's "Common Accounts" template ships with.
 */
const PERSONAL: AccountTemplate = {
  id: "personal",
  name: "Personal Finance",
  description:
    "Bank accounts, cards, everyday income and expenses — ideal for tracking household finances.",
  accounts: [
    {
      name: "Assets",
      type: "ASSET",
      placeholder: true,
      children: [
        {
          name: "Current Assets",
          type: "ASSET",
          placeholder: true,
          children: [
            { name: "Cash in Wallet", type: "CASH" },
            { name: "Current Account", type: "BANK" },
            { name: "Savings Account", type: "BANK" },
          ],
        },
      ],
    },
    {
      name: "Liabilities",
      type: "LIABILITY",
      placeholder: true,
      children: [
        { name: "Credit Card", type: "CREDIT" },
      ],
    },
    {
      name: "Income",
      type: "INCOME",
      placeholder: true,
      children: [
        { name: "Salary", type: "INCOME" },
        { name: "Interest", type: "INCOME" },
        { name: "Other Income", type: "INCOME" },
      ],
    },
    {
      name: "Expenses",
      type: "EXPENSE",
      placeholder: true,
      children: [
        { name: "Groceries", type: "EXPENSE" },
        { name: "Dining", type: "EXPENSE" },
        { name: "Transport", type: "EXPENSE" },
        {
          name: "Housing",
          type: "EXPENSE",
          placeholder: true,
          children: [
            { name: "Rent/Mortgage", type: "EXPENSE" },
            { name: "Utilities", type: "EXPENSE" },
            { name: "Internet", type: "EXPENSE" },
          ],
        },
        { name: "Entertainment", type: "EXPENSE" },
        { name: "Healthcare", type: "EXPENSE" },
        { name: "Shopping", type: "EXPENSE" },
      ],
    },
    {
      name: "Equity",
      type: "EQUITY",
      placeholder: true,
      children: [{ name: "Opening Balances", type: "EQUITY" }],
    },
  ],
};

/**
 * Small-business chart with AR/AP, revenue vs COGS vs operating expenses,
 * and payroll taxes. Designed for sole traders or small LLCs — not a
 * substitute for a proper accountant's chart, but a reasonable starting
 * point for bookkeeping in GnuDash.
 */
const SMALL_BUSINESS: AccountTemplate = {
  id: "small-business",
  name: "Small Business",
  description:
    "Revenue, COGS, AR/AP, payroll — a starting chart for sole traders and small LLCs.",
  accounts: [
    {
      name: "Assets",
      type: "ASSET",
      placeholder: true,
      children: [
        {
          name: "Current Assets",
          type: "ASSET",
          placeholder: true,
          children: [
            { name: "Business Checking", type: "BANK" },
            { name: "Petty Cash", type: "CASH" },
            { name: "Accounts Receivable", type: "RECEIVABLE" },
          ],
        },
        {
          name: "Fixed Assets",
          type: "ASSET",
          placeholder: true,
          children: [{ name: "Equipment", type: "ASSET" }],
        },
      ],
    },
    {
      name: "Liabilities",
      type: "LIABILITY",
      placeholder: true,
      children: [
        { name: "Accounts Payable", type: "PAYABLE" },
        { name: "Sales Tax Payable", type: "LIABILITY" },
        { name: "Payroll Tax Payable", type: "LIABILITY" },
      ],
    },
    {
      name: "Income",
      type: "INCOME",
      placeholder: true,
      children: [
        { name: "Sales", type: "INCOME" },
        { name: "Service Revenue", type: "INCOME" },
      ],
    },
    {
      name: "Expenses",
      type: "EXPENSE",
      placeholder: true,
      children: [
        {
          name: "Cost of Goods Sold",
          type: "EXPENSE",
          placeholder: true,
          children: [
            { name: "Materials", type: "EXPENSE" },
            { name: "Subcontractors", type: "EXPENSE" },
          ],
        },
        {
          name: "Operating Expenses",
          type: "EXPENSE",
          placeholder: true,
          children: [
            { name: "Rent", type: "EXPENSE" },
            { name: "Utilities", type: "EXPENSE" },
            { name: "Office Supplies", type: "EXPENSE" },
            { name: "Software Subscriptions", type: "EXPENSE" },
            { name: "Professional Fees", type: "EXPENSE" },
            { name: "Travel", type: "EXPENSE" },
          ],
        },
        {
          name: "Payroll",
          type: "EXPENSE",
          placeholder: true,
          children: [
            { name: "Wages", type: "EXPENSE" },
            { name: "Payroll Taxes", type: "EXPENSE" },
          ],
        },
      ],
    },
    {
      name: "Equity",
      type: "EQUITY",
      placeholder: true,
      children: [
        { name: "Opening Balances", type: "EQUITY" },
        { name: "Owner's Draw", type: "EQUITY" },
      ],
    },
  ],
};

/**
 * Brokerage-focused template. Provides placeholders for holdings, dividend
 * income, realised/unrealised gains, and brokerage fees. STOCK accounts are
 * intentionally *not* pre-seeded because each one needs a matching
 * commodity (ticker) the user hasn't declared yet — the user adds securities
 * through the account editor after creation.
 */
const INVESTMENT: AccountTemplate = {
  id: "investment",
  name: "Investment / Brokerage",
  description:
    "Brokerage cash, dividend income, gains/losses — placeholders for adding securities later.",
  accounts: [
    {
      name: "Assets",
      type: "ASSET",
      placeholder: true,
      children: [
        { name: "Brokerage Cash", type: "BANK" },
        {
          name: "Investments",
          type: "ASSET",
          placeholder: true,
          description: "Add STOCK/MUTUAL sub-accounts per holding.",
        },
      ],
    },
    {
      name: "Liabilities",
      type: "LIABILITY",
      placeholder: true,
    },
    {
      name: "Income",
      type: "INCOME",
      placeholder: true,
      children: [
        { name: "Dividends", type: "INCOME" },
        { name: "Interest", type: "INCOME" },
        { name: "Realised Gains", type: "INCOME" },
      ],
    },
    {
      name: "Expenses",
      type: "EXPENSE",
      placeholder: true,
      children: [
        { name: "Brokerage Fees", type: "EXPENSE" },
        { name: "Realised Losses", type: "EXPENSE" },
      ],
    },
    {
      name: "Equity",
      type: "EQUITY",
      placeholder: true,
      children: [
        { name: "Opening Balances", type: "EQUITY" },
        { name: "Unrealised Gains", type: "EQUITY" },
      ],
    },
  ],
};

/**
 * Ordered registry used by the wizard picker. Order is display order.
 */
export const TEMPLATES: readonly AccountTemplate[] = [
  PERSONAL,
  SMALL_BUSINESS,
  INVESTMENT,
  MINIMAL,
];

export function getTemplateById(id: string): AccountTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export type { AccountTemplate, TemplateAccount } from "./types";
