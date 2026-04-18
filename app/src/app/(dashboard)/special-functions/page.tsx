"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Wand2, Layers, Target } from "lucide-react";

/**
 * Index for the "Special functions" area: a home for experimental or
 * narrowly-scoped power tools that don't yet have a natural place in the
 * main app shell. Bulk edit lives here until a better home emerges.
 */
export default function SpecialFunctionsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="mt-1 rounded-lg bg-[#6C9B8B]/10 p-2 text-[#6C9B8B]">
          <Wand2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1D1F]">Special functions</h1>
          <p className="mt-1 text-sm text-[#6F767E]">
            Power tools for cleaning up imported books and performing operations that
            don&apos;t fit into the normal ledger flow.
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/special-functions/bulk-edit" className="group">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-[#3B6B8A]/10 p-2 text-[#3B6B8A]">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#1A1D1F] group-hover:text-[#3B6B8A]">
                    Bulk edit transactions
                  </h2>
                  <p className="mt-1 text-sm text-[#6F767E]">
                    Group simple (2-posting) transactions by description and rename or
                    reassign accounts across the whole group in one step. Useful for
                    cleaning up auto-imported data.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/special-functions/budgets" className="group">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-[#6C9B8B]/10 p-2 text-[#6C9B8B]">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#1A1D1F] group-hover:text-[#6C9B8B]">
                    Budgets
                  </h2>
                  <p className="mt-1 text-sm text-[#6F767E]">
                    Create and edit budgets against your chart of accounts. Any account,
                    any period. Parent accounts auto-sum from their children, and
                    imbalances are flagged inline.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
