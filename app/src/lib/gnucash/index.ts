import type { DashboardData } from "@/lib/types/gnucash";
import { openAndValidate } from "./db/connection";
import { buildParseContext } from "./context";
import { buildAccountTree } from "./domain/accounts";
import { computeNetWorthSeries, computeCurrentNetWorth } from "./domain/net-worth";
import { computeCashFlowSeries } from "./domain/cash-flow";
import { computeExpenseBreakdown, getExpenseTransactions } from "./domain/expenses";
import { computeIncomeBreakdown, getIncomeTransactions } from "./domain/income";
import { computeInvestments, computeInvestmentValueSeries } from "./domain/investments";
import { computeTopBalances } from "./domain/balances";
import { getLedgerTransactions, getRecentTransactions } from "./domain/ledger";
import { computeBudgetData } from "./domain/budgets";
import { computeCashFlowBudgetData } from "./domain/cash-flow-budget";
import { getUpcomingBills } from "./domain/bills";
import { hasClosingTransactions } from "./domain/closing";
import { formatMonth } from "./shared/dates";

export function parseGnuCashFile(filePath: string, overrideBaseCurrencyGuid?: string): DashboardData {
  const db = openAndValidate(filePath);

  try {
    const ctx = buildParseContext(db, overrideBaseCurrencyGuid);

    const accountTree = buildAccountTree(ctx);
    const netWorthSeries = computeNetWorthSeries(ctx);
    const cashFlowSeries = computeCashFlowSeries(ctx);
    const { categories: expenseBreakdown, monthly: monthlyExpensesByCategory, colors: expenseCategoryColors } = computeExpenseBreakdown(ctx);
    const investments = computeInvestments(ctx);
    const investmentValueSeries = computeInvestmentValueSeries(ctx);
    const topBalances = computeTopBalances(ctx);
    const expenseTransactions = getExpenseTransactions(ctx);
    const { monthly: monthlyIncomeByCategory, colors: incomeCategoryColors } = computeIncomeBreakdown(ctx);
    const incomeTransactions = getIncomeTransactions(ctx);
    const recentTransactions = getRecentTransactions(ctx);
    const upcomingBills = getUpcomingBills(ctx);
    const ledgerTransactions = getLedgerTransactions(ctx);
    const budgetData = computeBudgetData(ctx);
    const cashFlowBudgetData = computeCashFlowBudgetData(ctx);
    const currentNetWorth = computeCurrentNetWorth(ctx);

    const now = new Date();
    const currentMonth = formatMonth(now);
    const currentCF = cashFlowSeries.find((cf) => cf.month === currentMonth);

    const currentIncome = currentCF?.income ?? 0;
    const currentExpenses = currentCF?.expenses ?? 0;
    const savingsRate =
      currentIncome > 0
        ? ((currentIncome - currentExpenses) / currentIncome) * 100
        : 0;

    const hasClosing = hasClosingTransactions(ctx);

    let cashFlowSeriesExcludingClosing: typeof cashFlowSeries | undefined;
    let expenseBreakdownExcludingClosing: typeof expenseBreakdown | undefined;
    let monthlyExpensesByCategoryExcludingClosing: typeof monthlyExpensesByCategory | undefined;
    let expenseCategoryColorsExcludingClosing: typeof expenseCategoryColors | undefined;
    let monthlyIncomeByCategoryExcludingClosing: typeof monthlyIncomeByCategory | undefined;
    let incomeCategoryColorsExcludingClosing: typeof incomeCategoryColors | undefined;

    if (hasClosing) {
      cashFlowSeriesExcludingClosing = computeCashFlowSeries(ctx, true);
      const excExpense = computeExpenseBreakdown(ctx, true);
      expenseBreakdownExcludingClosing = excExpense.categories;
      monthlyExpensesByCategoryExcludingClosing = excExpense.monthly;
      expenseCategoryColorsExcludingClosing = excExpense.colors;
      const excIncome = computeIncomeBreakdown(ctx, true);
      monthlyIncomeByCategoryExcludingClosing = excIncome.monthly;
      incomeCategoryColorsExcludingClosing = excIncome.colors;
    }

    const baseCommodity = ctx.commodityMap.get(ctx.baseCurrencyGuid);

    return {
      currency: ctx.baseCurrencyMnemonic,
      currencyGuid: ctx.baseCurrencyGuid,
      currencyFraction: baseCommodity?.fraction ?? 100,
      accounts: accountTree,
      netWorthSeries,
      cashFlowSeries,
      expenseBreakdown,
      monthlyExpensesByCategory,
      expenseCategoryColors,
      expenseTransactions,
      monthlyIncomeByCategory,
      incomeCategoryColors,
      incomeTransactions,
      investments,
      investmentValueSeries,
      topBalances,
      recentTransactions,
      upcomingBills,
      currentNetWorth,
      currentMonthIncome: currentIncome,
      currentMonthExpenses: currentExpenses,
      savingsRate,
      budgetData,
      cashFlowBudgetData,
      ledgerTransactions,
      commodities: ctx.commodities.map((c) => ({
        guid: c.guid,
        namespace: c.namespace,
        mnemonic: c.mnemonic,
        fullname: c.fullname,
        fraction: c.fraction,
      })),
      availableCurrencies: ctx.availableCurrencies,
      hasClosingTransactions: hasClosing,
      cashFlowSeriesExcludingClosing,
      expenseBreakdownExcludingClosing,
      monthlyExpensesByCategoryExcludingClosing,
      expenseCategoryColorsExcludingClosing,
      monthlyIncomeByCategoryExcludingClosing,
      incomeCategoryColorsExcludingClosing,
    };
  } finally {
    db.close();
  }
}
