"use client";

export function NoBudgetState({
  message = "Create a budget in GNUCash to see your budget vs actual spending here. Go to Actions > Budget > New Budget in GNUCash.",
}: {
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="rounded-full bg-[#F4F5F7] p-4">
        <svg className="h-8 w-8 text-[#9A9FA5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-[#1A1D1F]">No budgets found</h3>
      <p className="max-w-sm text-xs text-[#9A9FA5]">{message}</p>
    </div>
  );
}
