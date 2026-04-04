/**
 * AccountBuilder — Fluent API for creating accounts in the GNUCash database.
 */

import type { ParseContext } from "../../context";
import type { WritableDbAdapter } from "../db/writable-adapter";
import { generateGuid } from "../guid";
import type { AccountType, ValidationError } from "../types";
import { ValidationFailedError } from "../types";
import { validateAccountCreation } from "../validation/account-rules";

export class AccountBuilder {
  private db: WritableDbAdapter;
  private ctx: ParseContext;
  private _name: string = "";
  private _accountType: AccountType = "BANK";
  private _commodityGuid: string = "";
  private _parentGuid: string = "";
  private _code: string = "";
  private _description: string = "";
  private _hidden: boolean = false;
  private _placeholder: boolean = false;

  constructor(db: WritableDbAdapter, ctx: ParseContext) {
    this.db = db;
    this.ctx = ctx;
  }

  name(n: string): this {
    this._name = n;
    return this;
  }

  type(t: AccountType): this {
    this._accountType = t;
    return this;
  }

  commodity(guid: string): this {
    this._commodityGuid = guid;
    return this;
  }

  parent(guid: string): this {
    this._parentGuid = guid;
    return this;
  }

  code(c: string): this {
    this._code = c;
    return this;
  }

  description(d: string): this {
    this._description = d;
    return this;
  }

  hidden(h: boolean): this {
    this._hidden = h;
    return this;
  }

  placeholder(p: boolean): this {
    this._placeholder = p;
    return this;
  }

  /**
   * Validate without committing. Returns all validation errors.
   */
  validate(): ValidationError[] {
    return validateAccountCreation(
      {
        name: this._name,
        accountType: this._accountType,
        commodityGuid: this._commodityGuid,
        parentGuid: this._parentGuid,
        code: this._code,
        description: this._description,
        hidden: this._hidden,
        placeholder: this._placeholder,
      },
      this.ctx.accountMap,
      this.ctx.commodityMap
    );
  }

  /**
   * Validate and commit the account creation atomically.
   *
   * NOTE: After committing, the ParseContext is stale.
   * The caller should rebuild it if they need updated caches.
   */
  commit(): { accountGuid: string } {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new ValidationFailedError(errors);
    }

    const accountGuid = generateGuid();

    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid,
                               code, description, hidden, placeholder)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        accountGuid,
        this._name,
        this._accountType,
        this._commodityGuid,
        this._parentGuid,
        this._code,
        this._description,
        this._hidden ? 1 : 0,
        this._placeholder ? 1 : 0
      );
    });

    return { accountGuid };
  }
}
