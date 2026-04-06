/**
 * GNUCash XML parser.
 *
 * Parses a GNUCash v2 XML file into structured data that can be inserted
 * into an in-memory SQLite DB matching the GNUCash schema.
 *
 * Uses the browser DOMParser API — must run on the main thread.
 */
import type { GnuCashXmlData, XmlParsedSplit, XmlParsedTransaction } from "./types";
import { generateGuid } from "../engine/guid";

// ── GNUCash XML namespace URIs ──────────────────────────────────────
const NS = {
  gnc: "http://www.gnucash.org/XML/gnc",
  act: "http://www.gnucash.org/XML/act",
  book: "http://www.gnucash.org/XML/book",
  cmdty: "http://www.gnucash.org/XML/cmdty",
  price: "http://www.gnucash.org/XML/price",
  slot: "http://www.gnucash.org/XML/slot",
  split: "http://www.gnucash.org/XML/split",
  sx: "http://www.gnucash.org/XML/sx",
  trn: "http://www.gnucash.org/XML/trn",
  ts: "http://www.gnucash.org/XML/ts",
  bgt: "http://www.gnucash.org/XML/bgt",
  recurrence: "http://www.gnucash.org/XML/recurrence",
} as const;

// ── Helpers ─────────────────────────────────────────────────────────

/** Get text content of the first child element matching ns:localName. */
function childText(parent: Element, ns: string, localName: string): string {
  const el = parent.getElementsByTagNameNS(ns, localName)[0];
  return el?.textContent?.trim() ?? "";
}

/** Get the first child element matching ns:localName, or null. */
function childEl(parent: Element, ns: string, localName: string): Element | null {
  return parent.getElementsByTagNameNS(ns, localName)[0] ?? null;
}

/** Parse a "num/denom" string → { num, denom }. */
function parseNumDenom(s: string): { num: number; denom: number } {
  const slash = s.indexOf("/");
  if (slash === -1) return { num: Number(s) || 0, denom: 1 };
  return {
    num: Number(s.slice(0, slash)) || 0,
    denom: Number(s.slice(slash + 1)) || 1,
  };
}

/**
 * Normalise a GNUCash XML date string to the format the SQLite schema uses.
 * Input:  "2025-01-01 10:59:00 +0200" or "2025-01-01 10:59:00 +0000"
 * Output: "2025-01-01 10:59:00"   (timezone stripped)
 */
function normaliseDate(raw: string): string {
  // Strip timezone suffix (e.g. " +0200")
  return raw.replace(/\s*[+-]\d{4}$/, "");
}

/**
 * Resolve a commodity reference (cmdty:space + cmdty:id pair inside a parent element)
 * to a GUID from the commodity lookup map.
 */
function resolveCommodity(
  parent: Element,
  commodityKey: Map<string, string>,
): string {
  const space = childText(parent, NS.cmdty, "space");
  const id = childText(parent, NS.cmdty, "id");
  const key = `${space}:${id}`;
  return commodityKey.get(key) ?? "";
}

/**
 * Check account slots for placeholder/hidden boolean flags.
 * Returns { hidden: 0|1, placeholder: 0|1 }.
 */
function parseAccountSlots(accountEl: Element): { hidden: number; placeholder: number } {
  let hidden = 0;
  let placeholder = 0;

  const slotsEl = childEl(accountEl, NS.act, "slots");
  if (!slotsEl) return { hidden, placeholder };

  // Slots are direct <slot> children (no namespace)
  const slotEls = slotsEl.getElementsByTagNameNS(NS.slot, "key");
  for (const keyEl of Array.from(slotEls)) {
    const key = keyEl.textContent?.trim() ?? "";
    const valueEl = keyEl.parentElement?.getElementsByTagNameNS(NS.slot, "value")[0];
    const value = valueEl?.textContent?.trim() ?? "";

    if (key === "placeholder" && value === "true") placeholder = 1;
    if (key === "hidden" && value === "true") hidden = 1;
  }

  return { hidden, placeholder };
}

// ── Main parser ─────────────────────────────────────────────────────

export function parseGnuCashXml(xmlString: string): GnuCashXmlData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");

  // Check for XML parse errors
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent}`);
  }

  // Find the book element
  const bookEl = doc.getElementsByTagNameNS(NS.gnc, "book")[0];
  if (!bookEl) {
    throw new Error("XML parse error: no gnc:book element found");
  }

  const bookGuid = childText(bookEl, NS.book, "id");
  if (!bookGuid) {
    throw new Error("XML parse error: book has no book:id");
  }

  // ── 1. Commodities ──────────────────────────────────────────────
  // Build a (space:mnemonic) → GUID lookup map.
  // XML commodities don't have GUIDs — we generate them.
  const commodityKey = new Map<string, string>(); // "CURRENCY:USD" → guid
  const commodities: GnuCashXmlData["commodities"] = [];

  const commodityEls = bookEl.getElementsByTagNameNS(NS.gnc, "commodity");
  for (const el of Array.from(commodityEls)) {
    const space = childText(el, NS.cmdty, "space");
    const mnemonic = childText(el, NS.cmdty, "id");
    const key = `${space}:${mnemonic}`;

    // Skip duplicates (XML can declare same commodity in multiple places)
    if (commodityKey.has(key)) continue;

    // Map ISO4217 → CURRENCY to match GNUCash SQLite convention
    const namespace = space === "ISO4217" ? "CURRENCY" : space;

    const guid = generateGuid();
    commodityKey.set(key, guid);
    // Also register with the normalised namespace key
    if (space === "ISO4217") {
      commodityKey.set(`CURRENCY:${mnemonic}`, guid);
    }

    commodities.push({
      guid,
      namespace,
      mnemonic,
      fullname: childText(el, NS.cmdty, "name") || childText(el, NS.cmdty, "fullname"),
      cusip: childText(el, NS.cmdty, "xcode") || childText(el, NS.cmdty, "cusip"),
      fraction: Number(childText(el, NS.cmdty, "fraction")) || 100,
    });
  }

  // ── 2. Accounts ─────────────────────────────────────────────────
  // Only parse accounts inside <gnc:book>, not template-transactions
  const accounts: GnuCashXmlData["accounts"] = [];
  let rootAccountGuid = "";

  const accountEls = bookEl.getElementsByTagNameNS(NS.gnc, "account");
  for (const el of Array.from(accountEls)) {
    // Skip accounts inside <gnc:template-transactions>
    if (el.closest("template-transactions")) continue;
    // Also skip if the parent chain includes a template-transactions element
    let inTemplate = false;
    let p: Element | null = el.parentElement;
    while (p && p !== bookEl) {
      if (p.localName === "template-transactions") { inTemplate = true; break; }
      p = p.parentElement;
    }
    if (inTemplate) continue;

    const guid = childText(el, NS.act, "id");
    const accountType = childText(el, NS.act, "type");

    // Resolve the commodity for this account
    const commodityEl = childEl(el, NS.act, "commodity");
    let commodityGuid = "";
    if (commodityEl) {
      commodityGuid = resolveCommodity(commodityEl, commodityKey);
      // If commodity wasn't declared, auto-register it
      if (!commodityGuid) {
        const space = childText(commodityEl, NS.cmdty, "space");
        const id = childText(commodityEl, NS.cmdty, "id");
        const namespace = space === "ISO4217" ? "CURRENCY" : space;
        const key = `${space}:${id}`;
        commodityGuid = generateGuid();
        commodityKey.set(key, commodityGuid);
        if (space === "ISO4217") commodityKey.set(`CURRENCY:${id}`, commodityGuid);
        commodities.push({
          guid: commodityGuid,
          namespace,
          mnemonic: id,
          fullname: "",
          cusip: "",
          fraction: Number(childText(el, NS.act, "commodity-scu")) || 100,
        });
      }
    }

    const parentGuid = childText(el, NS.act, "parent") || null;
    const { hidden, placeholder } = parseAccountSlots(el);

    if (accountType === "ROOT" && !rootAccountGuid) {
      rootAccountGuid = guid;
    }

    accounts.push({
      guid,
      name: childText(el, NS.act, "name"),
      accountType,
      commodityGuid,
      parentGuid,
      code: childText(el, NS.act, "code"),
      description: childText(el, NS.act, "description"),
      hidden,
      placeholder,
    });
  }

  if (!rootAccountGuid) {
    throw new Error("XML parse error: no ROOT account found");
  }

  // ── 3. Transactions ─────────────────────────────────────────────
  const transactions: XmlParsedTransaction[] = [];

  // Only parse transactions directly under gnc:book, skip template-transactions
  const transactionEls = bookEl.getElementsByTagNameNS(NS.gnc, "transaction");
  for (const el of Array.from(transactionEls)) {
    // Skip template transactions
    let inTemplate = false;
    let p: Element | null = el.parentElement;
    while (p && p !== bookEl) {
      if (p.localName === "template-transactions") { inTemplate = true; break; }
      p = p.parentElement;
    }
    if (inTemplate) continue;

    const guid = childText(el, NS.trn, "id");

    // Resolve currency
    const currencyEl = childEl(el, NS.trn, "currency");
    const currencyGuid = currencyEl ? resolveCommodity(currencyEl, commodityKey) : "";

    // Dates
    const postDateEl = childEl(el, NS.trn, "date-posted");
    const postDate = postDateEl ? normaliseDate(childText(postDateEl, NS.ts, "date")) : "";
    const enterDateEl = childEl(el, NS.trn, "date-entered");
    const enterDate = enterDateEl ? normaliseDate(childText(enterDateEl, NS.ts, "date")) : "";

    // Splits
    const splits: XmlParsedSplit[] = [];
    const splitEls = el.getElementsByTagNameNS(NS.trn, "split");
    for (const splitEl of Array.from(splitEls)) {
      splits.push({
        guid: childText(splitEl, NS.split, "id"),
        reconcileState: childText(splitEl, NS.split, "reconciled-state") || "n",
        value: childText(splitEl, NS.split, "value"),
        quantity: childText(splitEl, NS.split, "quantity"),
        accountGuid: childText(splitEl, NS.split, "account"),
        memo: childText(splitEl, NS.split, "memo"),
        action: childText(splitEl, NS.split, "action"),
        lotGuid: childText(splitEl, NS.split, "lot") || null,
      });
    }

    transactions.push({
      guid,
      currencyGuid,
      num: childText(el, NS.trn, "num"),
      postDate,
      enterDate,
      description: childText(el, NS.trn, "description"),
      splits,
    });
  }

  // ── 4. Prices ───────────────────────────────────────────────────
  const prices: GnuCashXmlData["prices"] = [];

  // Prices live inside <gnc:pricedb> > <price>
  const pricedbEl = bookEl.getElementsByTagNameNS(NS.gnc, "pricedb")[0];
  if (pricedbEl) {
    // <price> elements are not namespaced
    const priceEls = pricedbEl.getElementsByTagName("price");
    for (const el of Array.from(priceEls)) {
      const commodityEl = childEl(el, NS.price, "commodity");
      const currencyEl = childEl(el, NS.price, "currency");

      const commodityGuid = commodityEl ? resolveCommodity(commodityEl, commodityKey) : "";
      const currencyGuid = currencyEl ? resolveCommodity(currencyEl, commodityKey) : "";

      const timeEl = childEl(el, NS.price, "time");
      const date = timeEl ? normaliseDate(childText(timeEl, NS.ts, "date")) : "";

      const valueStr = childText(el, NS.price, "value");
      const { num, denom } = parseNumDenom(valueStr);

      prices.push({
        guid: childText(el, NS.price, "id") || generateGuid(),
        commodityGuid,
        currencyGuid,
        date,
        source: childText(el, NS.price, "source"),
        type: childText(el, NS.price, "type"),
        valueNum: num,
        valueDenom: denom,
      });
    }
  }

  // ── 5. Scheduled Transactions ───────────────────────────────────
  const schedxactions: GnuCashXmlData["schedxactions"] = [];
  const recurrences: GnuCashXmlData["recurrences"] = [];

  const sxEls = bookEl.getElementsByTagNameNS(NS.gnc, "schedxaction");
  for (const el of Array.from(sxEls)) {
    const guid = childText(el, NS.sx, "id");
    const enabled = childText(el, NS.sx, "enabled") === "y" ? 1 : 0;
    const autoCreate = childText(el, NS.sx, "autoCreate") === "y" ? 1 : 0;

    const startEl = childEl(el, NS.sx, "start");
    const startDate = startEl ? (startEl.getElementsByTagName("gdate")[0]?.textContent?.trim() ?? "") : "";

    const endEl = childEl(el, NS.sx, "end");
    const endDate = endEl ? (endEl.getElementsByTagName("gdate")[0]?.textContent?.trim() ?? null) : null;

    const lastEl = childEl(el, NS.sx, "last");
    const lastOccur = lastEl ? (lastEl.getElementsByTagName("gdate")[0]?.textContent?.trim() ?? null) : null;

    schedxactions.push({
      guid,
      name: childText(el, NS.sx, "name"),
      enabled,
      startDate,
      endDate,
      lastOccur,
      numOccur: Number(childText(el, NS.sx, "num-occur")) || 0,
      remOccur: Number(childText(el, NS.sx, "rem-occur")) || 0,
      autoCreate,
    });

    // Parse recurrences within this schedxaction
    const scheduleEl = childEl(el, NS.sx, "schedule");
    if (scheduleEl) {
      const recEls = scheduleEl.getElementsByTagNameNS(NS.gnc, "recurrence");
      for (const recEl of Array.from(recEls)) {
        const recStartEl = childEl(recEl, NS.recurrence, "start");
        const recStart = recStartEl
          ? (recStartEl.getElementsByTagName("gdate")[0]?.textContent?.trim() ?? "")
          : "";

        recurrences.push({
          objGuid: guid,
          mult: Number(childText(recEl, NS.recurrence, "mult")) || 1,
          periodType: childText(recEl, NS.recurrence, "period_type") || "month",
          periodStart: recStart,
        });
      }
    }
  }

  // ── 6. Budgets ──────────────────────────────────────────────────
  const budgets: GnuCashXmlData["budgets"] = [];
  const budgetAmounts: GnuCashXmlData["budgetAmounts"] = [];

  const budgetEls = bookEl.getElementsByTagNameNS(NS.gnc, "budget");
  for (const el of Array.from(budgetEls)) {
    const budgetGuid = childText(el, NS.bgt, "id");
    const numPeriods = Number(childText(el, NS.bgt, "num-periods")) || 12;

    budgets.push({
      guid: budgetGuid,
      name: childText(el, NS.bgt, "name"),
      description: childText(el, NS.bgt, "description"),
      numPeriods,
    });

    // Budget amounts are stored in bgt:slots as nested KVP:
    // <bgt:slots>
    //   <slot>
    //     <slot:key>{account-guid}</slot:key>
    //     <slot:value type="frame">
    //       <slot>
    //         <slot:key>{period-num}</slot:key>
    //         <slot:value type="numeric">num/denom</slot:value>
    //       </slot>
    //     </slot:value>
    //   </slot>
    // </bgt:slots>
    const bgtSlotsEl = childEl(el, NS.bgt, "slots");
    if (bgtSlotsEl) {
      // Top-level slots — each key is an account GUID
      const topSlots = Array.from(bgtSlotsEl.children).filter(
        (c) => c.localName === "slot"
      );
      for (const accountSlot of topSlots) {
        const accountGuid = accountSlot.getElementsByTagNameNS(NS.slot, "key")[0]
          ?.textContent?.trim() ?? "";
        if (!accountGuid) continue;

        const frameEl = accountSlot.getElementsByTagNameNS(NS.slot, "value")[0];
        if (!frameEl || frameEl.getAttribute("type") !== "frame") continue;

        // Inner slots — each key is a period number
        const periodSlots = Array.from(frameEl.children).filter(
          (c) => c.localName === "slot"
        );
        for (const periodSlot of periodSlots) {
          const periodStr = periodSlot.getElementsByTagNameNS(NS.slot, "key")[0]
            ?.textContent?.trim() ?? "";
          const periodNum = Number(periodStr);
          if (isNaN(periodNum)) continue;

          const amountStr = periodSlot.getElementsByTagNameNS(NS.slot, "value")[0]
            ?.textContent?.trim() ?? "0/1";
          const { num, denom } = parseNumDenom(amountStr);

          budgetAmounts.push({
            budgetGuid,
            accountGuid,
            periodNum,
            amountNum: num,
            amountDenom: denom,
          });
        }
      }
    }
  }

  return {
    bookGuid,
    rootAccountGuid,
    commodities,
    accounts,
    transactions,
    prices,
    budgets,
    budgetAmounts,
    schedxactions,
    recurrences,
  };
}
