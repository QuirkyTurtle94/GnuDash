"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Loader2, Lock } from "lucide-react";

/**
 * Passphrase entry for server-mode. Posts to /api/auth/login via the
 * dashboard context's login() helper; on success the parent flips
 * needsLogin=false and the upload flow resumes.
 */
export function LoginForm({
  login,
}: {
  login: (passphrase: string) => Promise<void>;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(passphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F5F7] p-4 sm:p-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center sm:mb-8">
          <Image
            src="/logo.png"
            alt="GnuDash"
            width={900}
            height={600}
            className="mx-auto mb-4 rounded-2xl"
            loading="eager"
            style={{ width: "auto", height: "auto" }}
          />
          <p className="mt-2 text-sm text-[#6F767E]">
            Enter your passphrase to access the server.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-3 rounded-2xl border-2 border-[#D4DAE0] bg-white p-6"
        >
          <label className="flex flex-col gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-[#1A1D1F]">
              <Lock className="h-3.5 w-3.5" />
              Passphrase
            </span>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoFocus
              autoComplete="current-password"
              required
              className="rounded-lg border border-[#D4DAE0] bg-[#F4F5F7] px-3 py-2 text-sm text-[#1A1D1F] focus:border-[#3B6B8A] focus:outline-none focus:ring-2 focus:ring-[#3B6B8A]/20"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || passphrase.length === 0}
            className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-[#3B6B8A] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#2E5470] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Verifying…
              </>
            ) : (
              "Log in"
            )}
          </button>
          {error && (
            <p className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">
              {error}
            </p>
          )}
        </form>

        <p className="mt-4 text-center text-xs text-[#9A9FA5]">
          Passphrase set by the operator at deploy time. Forgotten?
          There&rsquo;s no recovery — a new one has to be configured server-side.
        </p>
      </div>
    </div>
  );
}
