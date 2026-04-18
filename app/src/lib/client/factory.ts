/**
 * BookClient factory — picks a backend implementation based on build mode
 * and per-book configuration.
 *
 * Today this always returns OpfsBookClient (local mode). Once the Postgres
 * adapter lands, server builds will also be able to return ApiBookClient
 * for books whose config specifies `backend: "api"`.
 *
 * The ApiBookClient import will be dynamic so its module graph (and any
 * server-adjacent types it pulls in) is tree-shaken out of local builds.
 */
import type { BookClient } from "./book-client";
import { OpfsBookClient } from "./opfs-book-client";

/**
 * Supported backends for a book.
 * Extend this union when a new adapter is implemented.
 */
export type BookBackend = "opfs";

export interface BookConfig {
  backend: BookBackend;
}

const DEFAULT_CONFIG: BookConfig = { backend: "opfs" };

/**
 * Create a BookClient for the given book configuration.
 * Defaults to OPFS for the Phase 1 / local-mode path.
 */
export function createBookClient(config: BookConfig = DEFAULT_CONFIG): BookClient {
  switch (config.backend) {
    case "opfs":
      return new OpfsBookClient();
    default: {
      const _exhaustive: never = config.backend;
      throw new Error(`Unknown BookClient backend: ${_exhaustive as string}`);
    }
  }
}
