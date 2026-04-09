# Project Instructions

## Deployment

When asked to deploy to Cloudflare with wrangler:

1. Checkout `main` and pull latest: `git checkout main && git pull`
2. Build the app: `cd app && npm run build`
3. Deploy to Cloudflare Pages using the `dev` production branch:
   ```
   npx wrangler pages deploy ./out --project-name=gnudash --branch=dev
   ```

The production branch in Cloudflare Pages is configured as `dev` (not `main`). Using `--branch=dev` ensures the deployment goes to **production** rather than preview.

## Upcoming Features

### Dedicated Cash Flow Page
Build a dedicated cash flow page that shows true cash flow — net inflows and outflows of cash accounts (BANK, CASH type accounts), tracked against their budgets. This is distinct from the current "Net Income" card on the dashboard which shows income minus expenses.
