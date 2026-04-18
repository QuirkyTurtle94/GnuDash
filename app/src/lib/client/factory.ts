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
export type BookBackend = "opfs" | "api";

export interface BookConfig {
  backend: BookBackend;
}

const DEFAULT_CONFIG: BookConfig = { backend: "opfs" };

const SERVER_MODE = process.env.NEXT_PUBLIC_SERVER_MODE === "1";

/**
 * Create a BookClient for the given book configuration.
 *
 * Defaults to OPFS. In server-mode builds, "api" routes through
 * ApiBookClient; in local-mode builds, requesting "api" throws because
 * the module stays out of the static bundle (dynamic require + compile-time
 * flag).
 */
export function createBookClient(config: BookConfig = DEFAULT_CONFIG): BookClient {
  switch (config.backend) {
    case "opfs":
      return new OpfsBookClient();
    case "api": {
      if (!SERVER_MODE) {
        throw new Error(
          "API-backed books require a server-mode build (BUILD_MODE=server)."
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./api-book-client") as typeof import("./api-book-client");
      return new mod.ApiBookClient();
    }
    default: {
      const _exhaustive: never = config.backend;
      throw new Error(`Unknown BookClient backend: ${_exhaustive as string}`);
    }
  }
}
