"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Server, Sparkles, Upload } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import type { PostgresConnectionInfo } from "@/lib/gnucash/worker/messages";
import { loadServerConfig } from "@/lib/storage/server-config";
import { FreshBookWizard } from "./fresh-book-wizard";

/**
 * Server (Postgres) backend panel of the upload screen.
 *
 * Two modes, selected by the user via a radio at the top:
 *
 * - **gnudash-managed** (default) — gnudash owns a dedicated schema named
 *   `book_{bookId}`. Full read-write: every mutation applied locally first
 *   and round-tripped to Postgres via the sync client. Flow:
 *     connect form → test-connection → book/status → load-existing *or*
 *     file-picker-to-import.
 *
 * - **existing GnuCash DB** — points gnudash at a schema maintained by
 *   GnuCash desktop (usually `public`). Opened read-only: writes are
 *   blocked at the context level, an amber banner is shown, and no sync
 *   client is created. Flow:
 *     connect form + schema field → book/status → openExistingGnuCashBook
 *     (no import step, no file picker — we never write to this schema).
 *
 * Credentials never leave the browser except via the API calls above;
 * DashboardContext persists them to OPFS on success so auto-reconnect works
 * on next load.
 */

type Mode = "gnudash" | "existing";

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
const DEFAULT_EXISTING_SCHEMA = "public";

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

export function ServerConnectPanel() {
  const {
    openPostgresBook,
    importFileToPostgres,
    openExistingGnuCashBook,
    isLoading,
    error,
  } = useDashboard();

  const [mode, setMode] = useState<Mode>("gnudash");
  const [connection, setConnection] =
    useState<PostgresConnectionInfo>(DEFAULT_CONNECTION);
  const [bookId, setBookId] = useState(DEFAULT_BOOK_ID);
  const [existingSchema, setExistingSchema] = useState(DEFAULT_EXISTING_SCHEMA);
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // Prefill from OPFS-persisted server-config when the panel mounts so users
  // who land here after a failed auto-reconnect don't have to retype every
  // field. Runs after first paint to keep SSR/CSR output identical.
  useEffect(() => {
    let cancelled = false;
    loadServerConfig()
      .then((saved) => {
        if (cancelled || !saved) return;
        setConnection({
          host: saved.host,
          port: saved.port,
          user: saved.user,
          password: saved.password,
          database: saved.database,
          ssl: saved.ssl ?? false,
        });
        if (saved.mode === "existing" && saved.schema) {
          setMode("existing");
          setExistingSchema(saved.schema);
        } else if (saved.bookId) {
          setMode("gnudash");
          setBookId(saved.bookId);
        }
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
        throw new Error(
          body.error ?? `Connect failed: HTTP ${testRes.status}`,
        );
      }

      // 2. Schema probe. Pass bookId OR schema depending on mode — the
      //    route handler validates exactly one is supplied.
      const statusBody =
        mode === "existing"
          ? { connection, schema: existingSchema }
          : { connection, bookId };
      const statusRes = await fetch("/api/pg/book/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(statusBody),
      });
      if (!statusRes.ok) {
        const body = (await statusRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          body.error ?? `Status check failed: HTTP ${statusRes.status}`,
        );
      }
      const status = (await statusRes.json()) as {
        exists: boolean;
        missingTables?: string[];
      };

      if (mode === "existing") {
        // Read-only: we never import into someone else's GnuCash schema. If
        // the target is empty, we surface a clear error instead of offering
        // to clobber it.
        if (!status.exists) {
          throw new Error(
            `Schema "${existingSchema}" does not exist on this server.`,
          );
        }
        if (status.missingTables && status.missingTables.length > 0) {
          throw new Error(
            `Schema "${existingSchema}" exists but is missing required ` +
              `GnuCash tables: ${status.missingTables.join(", ")}.`,
          );
        }
        await openExistingGnuCashBook(connection, existingSchema);
        return;
      }

      // gnudash-managed flow: existing or bootstrap.
      if (
        status.exists &&
        (!status.missingTables || status.missingTables.length === 0)
      ) {
        await openPostgresBook(connection, bookId);
        return;
      }
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
  }, [
    connection,
    mode,
    bookId,
    existingSchema,
    openPostgresBook,
    openExistingGnuCashBook,
  ]);

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

  if (showWizard) {
    return (
      <FreshBookWizard
        target={{ kind: "postgres", connection, bookId }}
        onCancel={() => setShowWizard(false)}
      />
    );
  }

  return (
    <div>
      <div className="rounded-2xl border border-[#D4DAE0] bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Server className="h-4 w-4 text-[#6F767E]" />
          <span className="text-sm font-medium text-[#1A1D1F]">
            Postgres connection
          </span>
        </div>

        {/* Mode selector */}
        <div className="mb-4 space-y-2">
          <ModeRadio
            value="gnudash"
            label="gnudash-managed database"
            description="A schema gnudash owns — full read-write, cross-device sync."
            selected={mode}
            onSelect={setMode}
          />
          <ModeRadio
            value="existing"
            label="Existing GnuCash database (read-only)"
            description="Point at a schema your GnuCash desktop already writes to."
            selected={mode}
            onSelect={setMode}
          />
        </div>

        {mode === "existing" && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Read-only mode is advised when pointing at a database GnuCash
              desktop also uses. Close the desktop app before loading to avoid
              lock / cache conflicts.
            </span>
          </div>
        )}

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
            {mode === "existing" ? (
              <>
                <FieldLabel>Schema</FieldLabel>
                <FieldInput
                  value={existingSchema}
                  onChange={setExistingSchema}
                  placeholder="public"
                />
              </>
            ) : (
              <>
                <FieldLabel>Book id</FieldLabel>
                <FieldInput
                  value={bookId}
                  onChange={setBookId}
                  placeholder="default"
                />
              </>
            )}
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

      {stage.kind === "needs-import" && mode === "gnudash" && (
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
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[#D4DAE0]" />
            <span className="text-xs text-[#9A9FA5]">or</span>
            <div className="h-px flex-1 bg-[#D4DAE0]" />
          </div>
          <button
            onClick={() => setShowWizard(true)}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#D4DAE0] bg-white px-4 py-3 text-sm font-medium text-[#6F767E] transition-all hover:border-[#6C9B8B]/50 hover:bg-[#6C9B8B]/5 hover:text-[#6C9B8B] disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            Start fresh from a template
          </button>
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

interface ModeRadioProps {
  value: Mode;
  label: string;
  description: string;
  selected: Mode;
  onSelect: (v: Mode) => void;
}

function ModeRadio({
  value,
  label,
  description,
  selected,
  onSelect,
}: ModeRadioProps) {
  const active = selected === value;
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${
        active
          ? "border-[#6C9B8B] bg-[#6C9B8B]/5"
          : "border-[#D4DAE0] hover:border-[#6C9B8B]/50"
      }`}
    >
      <input
        type="radio"
        name="server-mode"
        value={value}
        checked={active}
        onChange={() => onSelect(value)}
        className="mt-0.5 h-3.5 w-3.5 text-[#6C9B8B] accent-[#6C9B8B]"
      />
      <div>
        <span className="block text-sm font-medium text-[#1A1D1F]">{label}</span>
        <span className="mt-0.5 block text-xs text-[#9A9FA5]">
          {description}
        </span>
      </div>
    </label>
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
