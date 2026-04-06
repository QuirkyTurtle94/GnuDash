/**
 * Intermediate types for GNUCash XML data, parsed before insertion into SQLite.
 * These mirror the SQLite schema columns so insertion is straightforward.
 */

export interface XmlParsedSplit {
  guid: string;
  reconcileState: string;
  value: string; // "num/denom" string
  quantity: string; // "num/denom" string
  accountGuid: string;
  memo: string;
  action: string;
  lotGuid: string | null;
}

export interface XmlParsedTransaction {
  guid: string;
  currencyGuid: string;
  num: string;
  postDate: string;
  enterDate: string;
  description: string;
  splits: XmlParsedSplit[];
}

export interface GnuCashXmlData {
  bookGuid: string;
  rootAccountGuid: string;
  commodities: {
    guid: string;
    namespace: string;
    mnemonic: string;
    fullname: string;
    cusip: string;
    fraction: number;
  }[];
  accounts: {
    guid: string;
    name: string;
    accountType: string;
    commodityGuid: string;
    parentGuid: string | null;
    code: string;
    description: string;
    hidden: number;
    placeholder: number;
  }[];
  transactions: XmlParsedTransaction[];
  prices: {
    guid: string;
    commodityGuid: string;
    currencyGuid: string;
    date: string;
    source: string;
    type: string;
    valueNum: number;
    valueDenom: number;
  }[];
  budgets: {
    guid: string;
    name: string;
    description: string;
    numPeriods: number;
  }[];
  budgetAmounts: {
    budgetGuid: string;
    accountGuid: string;
    periodNum: number;
    amountNum: number;
    amountDenom: number;
  }[];
  schedxactions: {
    guid: string;
    name: string;
    enabled: number;
    startDate: string;
    endDate: string | null;
    lastOccur: string | null;
    numOccur: number;
    remOccur: number;
    autoCreate: number;
  }[];
  recurrences: {
    objGuid: string;
    mult: number;
    periodType: string;
    periodStart: string;
  }[];
}
