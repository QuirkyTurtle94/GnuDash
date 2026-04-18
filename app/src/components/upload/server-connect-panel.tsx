"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Server, Upload } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import type { PostgresConnectionInfo } from "@/lib/gnucash/worker/messages";
import { loadServerConfig } from "@/lib/storage/server-config";

/**
 * Server (Postgres) backend panel of the upload screen (#48).
 *
 * Flow:
 *   1. Form collects host/port/user/password/database + book id.
 *   2. On Connect we POST /api/pg/test-connection to fail fast on bad creds.
 *   3. POST /api/pg/book/status — branch on `exists`.
 *   4. exists=true  → DashboardContext.openPostgresBook fetches the dump.
 *   5. exists=false → render a drag-and-drop step; on file pick,
 *      DashboardContext.importFileToPostgres uploads and then opens the book.
 *
 * Credentials do not leave the browser except via the API calls above.
 * DashboardContext persists them to OPFS on the first successful open so a
 * future PR can auto-reconnect on app boot.
 */

type Stage =
  | { kind: "form" }
  | { kind: "testing" }
  | { kind: "needs-import"; message: string }
  | { kind: "loading" };

const DEFAULT_CONNECTION: PostgresConnectionInfo = {
  host: "localhost",
  port: 5432,
  user: "gnudash",
  password: "",
  database: "gnudash",
  ssl: false,
};

const DEFAULT_BOOK_ID = "default";

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

export function ServerConnectPanel() {
  const { openPostgresBook, importFileToPostgres, isLoading, error } =
    useDashboard();

  const [connection, setConnection] =
    useState<PostgresConnectionInfo>(DEFAULT_CONNECTION);
  const [bookId, setBookId] = useState(DEFAULT_BOOK_ID);
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Prefill from OPFS-persisted server-config when the panel mounts so users
  // who land here after a failed auto-reconnect don't have to retype every
  // field. Runs after first paint to keep SSR/CSR output identical (OPFS
  // isn't accessible on the server).
  useEffect(() => {
    let cancelled = false;
    loadServerConfig()
      .then((saved) => {
        if (cancelled || !saved) return;
        const { bookId: savedBookId, ...rest } = saved;
        setConnection({
          host: rest.host,
          port: rest.port,
          user: rest.user,
          password: rest.password,
          database: rest.database,
          ssl: rest.ssl ?? false,
        });
        setBookId(savedBookId);
      })
      .catch(() => {
        // No saved config or OPFS unavailable — stay on defaults.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateConnection = useCallback(
    <K extends keyof PostgresConnectionInfo>(
      key: K,
      value: PostgresConnectionInfo[K],
    ) => {
      setConnection((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleConnect = useCallback(async () => {
    setLocalError(null);
    setFileSizeError(null);
    setStage({ kind: "testing" });

    try {
      // 1. Credential check — avoids surfacing the deeper "schema missing"
      //    message when the real problem is wrong host/user/password.
      const testRes = await fetch("/api/pg/test-connection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connection }),
      });
      if (!testRes.ok) {
        const body = (await testRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Connect failed: HTTP ${testRes.status}`);
      }

      // 2. Does the book exist already in this DB?
      const statusRes = await fetch("/api/pg/book/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connection, bookId }),
      });
      if (!statusRes.ok) {
        const body = (await statusRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Status check failed: HTTP ${statusRes.status}`);
      }
      const status = (await statusRes.json()) as {
        exists: boolean;
        missingTables?: string[];
      };

      if (
        status.exists &&
        (!status.missingTables || status.missingTables.length === 0)
      ) {
        // 3a. Existing, fully-provisioned book → load it.
        await openPostgresBook(connection, bookId);
        // openPostgresBook flips the backend state; this panel unmounts as
        // the dashboard takes over, so no further local stage update needed.
        return;
      }

      // 3b. Empty database (or an incomplete book) → ask the user to upload
      //     a .gnucash file to bootstrap the book.
      setStage({
        kind: "needs-import",
        message: status.exists
          ? "Book exists but is missing required tables — re-importing a file will rebuild it."
          : "No book found on this server yet. Upload your .gnucash file to create one.",
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Connect failed");
      setStage({ kind: "form" });
    }
  }, [connection, bookId, openPostgresBook]);

  const handleFile = useCallback(
    async (file: File) => {
      setFileSizeError(null);
      setLocalError(null);
      if (!file.name.endsWith(".gnucash")) return;
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFileSizeError(
          `File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). ` +
            "Maximum supported size is 200 MB.",
        );
        return;
      }
      setStage({ kind: "loading" });
      try {
        await importFileToPostgres(file, connection, bookId);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : "Import failed");
        setStage({ kind: "needs-import", message: "" });
      }
    },
    [connection, bookId, importFileToPostgres],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleBrowse = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gnucash";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleFile(file);
    };
    input.click();
  }, [handleFile]);

  // Context-level errors take precedence over local ones since they reflect
  // the most recent failed action (e.g. dump/import).
  const displayedError = error ?? localError ?? fileSizeError;
  const busy = isLoading || stage.kind === "testing" || stage.kind === "loading";

  return (
    <div>
      <div className="rounded-2xl border border-[#D4DAE0] bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Server className="h-4 w-4 text-[#6F767E]" />
          <span className="text-sm font-medium text-[#1A1D1F]">
            Postgres connection
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <FieldLabel>Host</FieldLabel>
            <FieldInput
              value={connection.host}
              onChange={(v) => updateConnection("host", v)}
              placeholder="localhost"
            />
          </div>
          <div>
            <FieldLabel>Port</FieldLabel>
            <FieldInput
              type="number"
              value={String(connection.port)}
              onChange={(v) => updateConnection("port", Number(v) || 5432)}
            />
          </div>
          <div>
            <FieldLabel>User</FieldLabel>
            <FieldInput
              value={connection.user}
              onChange={(v) => updateConnection("user", v)}
            />
          </div>
          <div className="col-span-2">
            <FieldLabel>Password</FieldLabel>
            <FieldInput
              type="password"
              value={connection.password}
              onChange={(v) => updateConnection("password", v)}
            />
          </div>
          <div className="col-span-2">
            <FieldLabel>Database</FieldLabel>
            <FieldInput
              value={connection.database}
              onChange={(v) => updateConnection("database", v)}
            />
          </div>
          <div>
            <FieldLabel>Book id</FieldLabel>
            <FieldInput
              value={bookId}
              onChange={setBookId}
              placeholder="default"
            />
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 text-xs text-[#6F767E]">
          <input
            type="checkbox"
            checked={connection.ssl ?? false}
            onChange={(e) => updateConnection("ssl", e.target.checked)}
            className="h-3.5 w-3.5 rounded border-[#D4DAE0] text-[#6C9B8B] accent-[#6C9B8B]"
          />
          Require TLS (necessary for any non-localhost server)
        </label>

        <button
          onClick={handleConnect}
          disabled={busy || !connection.password}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#6C9B8B] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#5A8877] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stage.kind === "testing" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            "Connect"
          )}
        </button>
      </div>

      {stage.kind === "needs-import" && (
        <div className="mt-4 space-y-3">
          {stage.message && (
            <div className="rounded-xl bg-[#F4F5F7] p-3 text-xs text-[#6F767E]">
              {stage.message}
            </div>
          )}
          <div
            onClick={handleBrowse}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
              isDragging
                ? "border-[#6C9B8B] bg-[#6C9B8B]/5"
                : "border-[#D4DAE0] bg-white hover:border-[#6C9B8B]/50 hover:bg-[#6C9B8B]/5"
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-10 w-10 text-[#9A9FA5]" />
              <div>
                <p className="text-sm font-medium text-[#1A1D1F]">
                  Drop your .gnucash file to bootstrap the book
                </p>
                <p className="mt-1 text-xs text-[#9A9FA5]">or click to browse</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {stage.kind === "loading" && (
        <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl border border-[#D4DAE0] bg-white p-6">
          <Loader2 className="h-5 w-5 animate-spin text-[#6C9B8B]" />
          <span className="text-sm text-[#1A1D1F]">
            Uploading and importing to Postgres...
          </span>
        </div>
      )}

      {displayedError && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-center">
          <p className="text-sm text-red-600">{displayedError}</p>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-[#9A9FA5]">
        Credentials are stored in your browser&apos;s Origin Private File System so
        this app can auto-reconnect. Use TLS and a strong password for any
        deployment past localhost.
      </p>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium text-[#6F767E]">
      {children}
    </label>
  );
}

interface FieldInputProps {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}

function FieldInput({
  value,
  onChange,
  type = "text",
  placeholder,
}: FieldInputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      className="w-full rounded-lg border border-[#D4DAE0] bg-white px-3 py-1.5 text-sm text-[#1A1D1F] placeholder:text-[#9A9FA5] focus:border-[#6C9B8B] focus:outline-none focus:ring-2 focus:ring-[#6C9B8B]/20"
    />
  );
}
