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
import { computeCashFlowByCategory } from "./domain/cash-flow-by-category";
import { getUpcomingBills } from "./domain/bills";
import { hasClosingTransactions } from "./domain/closing";
import { computeOrphanedPriceGuids } from "./domain/orphan-prices";
import { formatMonth } from "./shared/dates";

export async function parseGnuCashFile(filePath: string, overrideBaseCurrencyGuid?: string): Promise<DashboardData> {
  const db = await openAndValidate(filePath);

  try {
    const ctx = await buildParseContext(db, overrideBaseCurrencyGuid);

    const accountTree = await buildAccountTree(ctx);
    const netWorthSeries = await computeNetWorthSeries(ctx);
    const cashFlowSeries = await computeCashFlowSeries(ctx);
    const { categories: expenseBreakdown, monthly: monthlyExpensesByCategory, colors: expenseCategoryColors } = await computeExpenseBreakdown(ctx);
    const investments = await computeInvestments(ctx);
    const investmentValueSeries = await computeInvestmentValueSeries(ctx);
    const topBalances = await computeTopBalances(ctx);
    const expenseTransactions = await getExpenseTransactions(ctx);
    const { monthly: monthlyIncomeByCategory, colors: incomeCategoryColors } = await computeIncomeBreakdown(ctx);
    const incomeTransactions = await getIncomeTransactions(ctx);
    const recentTransactions = await getRecentTransactions(ctx);
    const upcomingBills = await getUpcomingBills(ctx);
    const ledgerTransactions = await getLedgerTransactions(ctx);
    const budgetData = await computeBudgetData(ctx);
    const cashFlowBudgetData = await computeCashFlowBudgetData(ctx);
    const { inflow: monthlyCashInflowByCategory, outflow: monthlyCashOutflowByCategory, inflowColors: cashInflowCategoryColors, outflowColors: cashOutflowCategoryColors } = await computeCashFlowByCategory(ctx);
    const currentNetWorth = await computeCurrentNetWorth(ctx);

    const now = new Date();
    const currentMonth = formatMonth(now);
    const currentCF = cashFlowSeries.find((cf) => cf.month === currentMonth);

    const currentIncome = currentCF?.income ?? 0;
    const currentExpenses = currentCF?.expenses ?? 0;
    const savingsRate =
      currentIncome > 0
        ? ((currentIncome - currentExpenses) / currentIncome) * 100
        : 0;

    const hasClosing = await hasClosingTransactions(ctx);

    let cashFlowSeriesExcludingClosing: typeof cashFlowSeries | undefined;
    let expenseBreakdownExcludingClosing: typeof expenseBreakdown | undefined;
    let monthlyExpensesByCategoryExcludingClosing: typeof monthlyExpensesByCategory | undefined;
    let expenseCategoryColorsExcludingClosing: typeof expenseCategoryColors | undefined;
    let monthlyIncomeByCategoryExcludingClosing: typeof monthlyIncomeByCategory | undefined;
    let incomeCategoryColorsExcludingClosing: typeof incomeCategoryColors | undefined;
    let monthlyCashInflowByCategoryExcludingClosing: typeof monthlyCashInflowByCategory | undefined;
    let monthlyCashOutflowByCategoryExcludingClosing: typeof monthlyCashOutflowByCategory | undefined;
    let cashInflowCategoryColorsExcludingClosing: typeof cashInflowCategoryColors | undefined;
    let cashOutflowCategoryColorsExcludingClosing: typeof cashOutflowCategoryColors | undefined;

    if (hasClosing) {
      cashFlowSeriesExcludingClosing = await computeCashFlowSeries(ctx, true);
      const excExpense = await computeExpenseBreakdown(ctx, true);
      expenseBreakdownExcludingClosing = excExpense.categories;
      monthlyExpensesByCategoryExcludingClosing = excExpense.monthly;
      expenseCategoryColorsExcludingClosing = excExpense.colors;
      const excIncome = await computeIncomeBreakdown(ctx, true);
      monthlyIncomeByCategoryExcludingClosing = excIncome.monthly;
      incomeCategoryColorsExcludingClosing = excIncome.colors;
      const excCashFlow = await computeCashFlowByCategory(ctx, true);
      monthlyCashInflowByCategoryExcludingClosing = excCashFlow.inflow;
      monthlyCashOutflowByCategoryExcludingClosing = excCashFlow.outflow;
      cashInflowCategoryColorsExcludingClosing = excCashFlow.inflowColors;
      cashOutflowCategoryColorsExcludingClosing = excCashFlow.outflowColors;
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
      prices: ctx.prices,
      orphanedPriceGuids: Array.from(await computeOrphanedPriceGuids(ctx)),
      availableCurrencies: ctx.availableCurrencies,
      hasClosingTransactions: hasClosing,
      cashFlowSeriesExcludingClosing,
      expenseBreakdownExcludingClosing,
      monthlyExpensesByCategoryExcludingClosing,
      expenseCategoryColorsExcludingClosing,
      monthlyIncomeByCategoryExcludingClosing,
      incomeCategoryColorsExcludingClosing,
      monthlyCashInflowByCategory,
      monthlyCashOutflowByCategory,
      cashInflowCategoryColors,
      cashOutflowCategoryColors,
      monthlyCashInflowByCategoryExcludingClosing,
      monthlyCashOutflowByCategoryExcludingClosing,
      cashInflowCategoryColorsExcludingClosing,
      cashOutflowCategoryColorsExcludingClosing,
    };
  } finally {
    db.close();
  }
}
