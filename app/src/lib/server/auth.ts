import "server-only";
/**
 * Passphrase verification for Phase 1.
 *
 * Uses Argon2id (@node-rs/argon2) with a decoy hash so the login response
 * time is constant regardless of whether the right passphrase was submitted.
 * The security review flagged timing differences on unknown email (Phase 2)
 * as a user-enumeration vector; applying the same pattern here keeps the
 * Phase 1 gate from leaking whether the attacker hit the actual envvar.
 *
 * The operator is expected to set APP_PASSPHRASE_HASH to an Argon2id-encoded
 * hash. The docs/deployment-server.md runbook tells them how to produce one
 * (one-shot CLI, not a runtime setting).
 */
import { verify } from "@node-rs/argon2";

/**
 * A fixed-parameter decoy hash. Generated with Argon2id defaults so the
 * verify call takes the same time as against a real hash of the expected
 * params. Never matches any real input.
 */
const DECOY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$wXL5c8WQoZOIoHU84nF5yyWfFzGwBhLdSvX4sQnRbKw";

/**
 * Verify a passphrase against APP_PASSPHRASE_HASH.
 *
 * Always runs exactly one argon2 verify — against the real hash if present,
 * otherwise against the decoy. Returns true only when the real hash exists
 * AND the passphrase matches.
 */
export async function verifyAppPassphrase(passphrase: string): Promise<boolean> {
  const realHash = process.env.APP_PASSPHRASE_HASH;

  // Enforce minimum shape on the hash itself so we can fail-closed early
  // in dev if the operator hasn't configured one.
  const hashToCheck =
    realHash && realHash.startsWith("$argon2") ? realHash : DECOY_HASH;

  // argon2 verify rejects empty strings fast; pass a single space to keep
  // the verify cost constant whether the attacker sent "" or a long string.
  const effectivePassphrase = passphrase.length === 0 ? " " : passphrase;

  let matched = false;
  try {
    matched = await verify(hashToCheck, effectivePassphrase);
  } catch {
    // Malformed hash etc. — treat as no match; don't leak via error shape.
    matched = false;
  }

  return Boolean(realHash && matched);
}
