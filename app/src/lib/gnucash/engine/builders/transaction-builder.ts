/**
 * TransactionBuilder — Fluent API for constructing and committing
 * double-entry transactions to the GNUCash database.
 *
 * Validates all invariants at commit time (not construction time),
 * matching GNUCash's BeginEdit/CommitEdit pattern.
 */

import type { ParseContext } from "../../context";
import type { WritableDbAdapter } from "../db/writable-adapter";
import { GncNumeric } from "../gnc-numeric";
import { generateGuid } from "../guid";
import type { SplitSpec, ValidationError } from "../types";
import { ValidationFailedError } from "../types";
import { validateTransaction } from "../validation/invariants";

/**
 * Format a Date as "YYYY-MM-DD HH:MM:SS" for GNUCash SQLite storage.
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

export class TransactionBuilder {
  private db: WritableDbAdapter;
  private ctx: ParseContext;
  private _currencyGuid: string = "";
  private _postDate: Date | null = null;
  private _description: string = "";
  private _num: string = "";
  private _splits: SplitSpec[] = [];

  constructor(db: WritableDbAdapter, ctx: ParseContext) {
    this.db = db;
    this.ctx = ctx;
  }

  /** Set the transaction's reference currency. */
  currency(guid: string): this {
    this._currencyGuid = guid;
    return this;
  }

  /** Set the posting date. */
  postDate(date: Date): this {
    this._postDate = date;
    return this;
  }

  /** Set the description / payee. */
  description(desc: string): this {
    this._description = desc;
    return this;
  }

  /** Set the check/reference number. */
  num(ref: string): this {
    this._num = ref;
    return this;
  }

  /**
   * Add a split with explicit value and quantity.
   * Use this for multi-currency, investment, or FX transactions.
   */
  addSplit(spec: SplitSpec): this {
    this._splits.push(spec);
    return this;
  }

  /**
   * Add a same-currency split where value == quantity.
   * The denominator is automatically set from the transaction currency's fraction.
   *
   * Use this for the common case where both the transaction and the account
   * use the same currency.
   */
  addSimpleSplit(
    accountGuid: string,
    amount: GncNumeric,
    memo?: string
  ): this {
    this._splits.push({
      accountGuid,
      value: amount,
      quantity: amount,
      memo,
    });
    return this;
  }

  /**
   * Validate without committing. Returns all validation errors.
   * Empty array means the transaction is valid.
   */
  validate(): ValidationError[] {
    return validateTransaction(
      this._splits,
      this._currencyGuid,
      this._description,
      this._postDate,
      this.ctx.accountMap,
      this.ctx.commodityMap
    );
  }

  /**
   * Validate and commit the transaction atomically.
   *
   * Throws ValidationFailedError if any invariant is violated.
   * All database writes are wrapped in a SQL transaction —
   * either everything succeeds or nothing changes.
   *
   * NOTE: After committing, the ParseContext is stale.
   * The caller should rebuild it if they need updated caches.
   */
  commit(): { transactionGuid: string; splitGuids: string[] } {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new ValidationFailedError(errors);
    }

    const txGuid = generateGuid();
    const splitGuids: string[] = [];
    const enterDate = formatDate(new Date());
    const postDate = formatDate(this._postDate!);

    this.db.transaction(() => {
      // Insert transaction header
      this.db.run(
        `INSERT INTO transactions (guid, currency_guid, num, post_date, enter_date, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        txGuid,
        this._currencyGuid,
        this._num,
        postDate,
        enterDate,
        this._description
      );

      // Insert each split
      for (const split of this._splits) {
        const splitGuid = generateGuid();
        splitGuids.push(splitGuid);

        this.db.run(
          `INSERT INTO splits (guid, tx_guid, account_guid, memo, action, reconcile_state,
                               value_num, value_denom, quantity_num, quantity_denom, lot_guid)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          splitGuid,
          txGuid,
          split.accountGuid,
          split.memo ?? "",
          split.action ?? "",
          split.reconcileState ?? "n",
          split.value.num,
          split.value.denom,
          split.quantity.num,
          split.quantity.denom,
          split.lotGuid ?? null
        );
      }
    });

    return { transactionGuid: txGuid, splitGuids };
  }
}
