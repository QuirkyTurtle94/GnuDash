import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearServerConfig,
  hasServerConfig,
  isServerConfigSupported,
  loadServerConfig,
  saveServerConfig,
  type ServerConfig,
} from "../server-config";

/**
 * Minimal in-memory OPFS stand-in. Holds files as string contents keyed by
 * name and implements just the subset of the real API the helper uses.
 */
function installOpfsMock(): Map<string, string> {
  const files = new Map<string, string>();

  const storage = {
    async getDirectory() {
      return {
        async getFileHandle(
          name: string,
          opts?: { create?: boolean },
        ) {
          if (!files.has(name) && !opts?.create) {
            throw new DOMException("not found", "NotFoundError");
          }
          if (!files.has(name)) files.set(name, "");
          return {
            async getFile() {
              if (!files.has(name)) {
                throw new DOMException("not found", "NotFoundError");
              }
              const contents = files.get(name) ?? "";
              return {
                async text() {
                  return contents;
                },
              };
            },
            async createWritable() {
              let buffer = "";
              return {
                async write(data: string) {
                  buffer += data;
                },
                async close() {
                  files.set(name, buffer);
                },
              };
            },
          };
        },
        async removeEntry(name: string) {
          if (!files.has(name)) {
            throw new DOMException("not found", "NotFoundError");
          }
          files.delete(name);
        },
      };
    },
  };

  vi.stubGlobal("navigator", { storage });
  return files;
}

const validConfig: ServerConfig = {
  host: "db.example",
  port: 5432,
  user: "gnudash",
  password: "hunter2",
  database: "gnudash",
  mode: "gnudash",
  bookId: "default",
};

const validExistingConfig: ServerConfig = {
  host: "db.example",
  port: 5432,
  user: "gnudash",
  password: "hunter2",
  database: "gnudash",
  mode: "existing",
  schema: "public",
};

describe("isServerConfigSupported", () => {
  it("returns true when navigator.storage.getDirectory exists", () => {
    installOpfsMock();
    expect(isServerConfigSupported()).toBe(true);
  });

  it("returns false when navigator is undefined", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isServerConfigSupported()).toBe(false);
  });

  it("returns false when storage.getDirectory is missing", () => {
    vi.stubGlobal("navigator", { storage: {} });
    expect(isServerConfigSupported()).toBe(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

describe("OPFS round-trip", () => {
  beforeEach(() => {
    installOpfsMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("save then load returns an equivalent config", async () => {
    await saveServerConfig(validConfig);
    const loaded = await loadServerConfig();
    expect(loaded).toEqual(validConfig);
  });

  it("preserves the optional ssl flag when true", async () => {
    await saveServerConfig({ ...validConfig, ssl: true });
    const loaded = await loadServerConfig();
    expect(loaded?.ssl).toBe(true);
  });

  it("hasServerConfig flips true after save and false after clear", async () => {
    expect(await hasServerConfig()).toBe(false);
    await saveServerConfig(validConfig);
    expect(await hasServerConfig()).toBe(true);
    await clearServerConfig();
    expect(await hasServerConfig()).toBe(false);
  });

  it("overwrites an existing file on save", async () => {
    await saveServerConfig(validConfig);
    await saveServerConfig({ ...validConfig, host: "new.example" });
    const loaded = await loadServerConfig();
    expect(loaded?.host).toBe("new.example");
  });

  it("clearServerConfig is idempotent when no file exists", async () => {
    await expect(clearServerConfig()).resolves.toBeUndefined();
  });

  it("roundtrips an existing-mode config with a schema field", async () => {
    await saveServerConfig(validExistingConfig);
    const loaded = await loadServerConfig();
    expect(loaded).toEqual(validExistingConfig);
  });
});

describe("legacy / mode compatibility", () => {
  beforeEach(() => {
    installOpfsMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a pre-v1 config (no mode field) as gnudash", async () => {
    const files = installOpfsMock();
    files.set(
      "gnudash-server.json",
      JSON.stringify({
        host: "db",
        port: 5432,
        user: "u",
        password: "p",
        database: "d",
        bookId: "default",
      }),
    );
    const loaded = await loadServerConfig();
    expect(loaded?.mode).toBe("gnudash");
    expect(loaded?.bookId).toBe("default");
  });

  it("rejects an existing-mode config missing the schema field", async () => {
    const files = installOpfsMock();
    files.set(
      "gnudash-server.json",
      JSON.stringify({
        host: "db",
        port: 5432,
        user: "u",
        password: "p",
        database: "d",
        mode: "existing",
      }),
    );
    expect(await loadServerConfig()).toBeNull();
  });

  it("rejects a gnudash-mode config missing the bookId field", async () => {
    const files = installOpfsMock();
    files.set(
      "gnudash-server.json",
      JSON.stringify({
        host: "db",
        port: 5432,
        user: "u",
        password: "p",
        database: "d",
        mode: "gnudash",
      }),
    );
    expect(await loadServerConfig()).toBeNull();
  });

  it("falls back to gnudash mode for an unrecognised mode string", async () => {
    const files = installOpfsMock();
    files.set(
      "gnudash-server.json",
      JSON.stringify({
        host: "db",
        port: 5432,
        user: "u",
        password: "p",
        database: "d",
        mode: "nonsense",
        bookId: "default",
      }),
    );
    const loaded = await loadServerConfig();
    expect(loaded?.mode).toBe("gnudash");
  });
});

describe("loadServerConfig validation", () => {
  beforeEach(() => {
    installOpfsMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when nothing has been saved", async () => {
    expect(await loadServerConfig()).toBeNull();
  });

  it("returns null when the file holds invalid JSON", async () => {
    const files = installOpfsMock();
    files.set("gnudash-server.json", "not {valid} json");
    expect(await loadServerConfig()).toBeNull();
  });

  it("returns null when fields are missing", async () => {
    const files = installOpfsMock();
    files.set(
      "gnudash-server.json",
      JSON.stringify({ host: "x", port: 5432 }),
    );
    expect(await loadServerConfig()).toBeNull();
  });

  it("returns null when a field has the wrong type", async () => {
    const files = installOpfsMock();
    files.set(
      "gnudash-server.json",
      JSON.stringify({ ...validConfig, port: "5432" }),
    );
    expect(await loadServerConfig()).toBeNull();
  });

  it("drops an unknown ssl type instead of rejecting the whole file", async () => {
    const files = installOpfsMock();
    files.set(
      "gnudash-server.json",
      JSON.stringify({ ...validConfig, ssl: "yes" }),
    );
    const loaded = await loadServerConfig();
    expect(loaded).not.toBeNull();
    expect(loaded?.ssl).toBeUndefined();
  });
});

describe("no-OPFS fallback behaviour", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { storage: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loadServerConfig returns null", async () => {
    expect(await loadServerConfig()).toBeNull();
  });

  it("hasServerConfig returns false", async () => {
    expect(await hasServerConfig()).toBe(false);
  });

  it("saveServerConfig throws a clear error", async () => {
    await expect(saveServerConfig(validConfig)).rejects.toThrow(
      /OPFS is not available/,
    );
  });

  it("clearServerConfig is a no-op", async () => {
    await expect(clearServerConfig()).resolves.toBeUndefined();
  });
});
