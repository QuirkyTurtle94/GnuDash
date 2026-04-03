import type { GnuCashAccount } from "@/lib/types/gnucash";

/**
 * Build the path parts for an account, stopping at any of the given stop GUIDs
 * or the root account. Returns array like ["Food", "Groceries", "Supermarket"].
 */
export function getAccountPath(
  account: GnuCashAccount,
  accountMap: Map<string, GnuCashAccount>,
  stopGuids: Set<string>,
  rootGuid: string
): string[] {
  const parts: string[] = [account.name];
  let current = account;
  while (
    current.parent_guid &&
    !stopGuids.has(current.parent_guid) &&
    current.parent_guid !== rootGuid
  ) {
    const parent = accountMap.get(current.parent_guid);
    if (!parent) break;
    parts.unshift(parent.name);
    current = parent;
  }
  return parts;
}

/**
 * Build the full path for an account from root, e.g. "Assets:Bank:Checking".
 */
export function buildFullPath(
  account: GnuCashAccount,
  accountMap: Map<string, GnuCashAccount>
): string {
  const parts: string[] = [account.name];
  let current = account;
  while (current.parent_guid) {
    const parent = accountMap.get(current.parent_guid);
    if (!parent || parent.account_type === "ROOT") break;
    parts.unshift(parent.name);
    current = parent;
  }
  return parts.join(":");
}
