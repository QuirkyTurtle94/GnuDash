import { chromium } from "@playwright/test";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "screenshots");

const BASE_URL = "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 900 };

async function run() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // retina-quality screenshots
  });
  const page = await context.newPage();

  // ── Step 1: Upload page (before data) ────────────────────────────
  console.log("📸 Capturing upload page...");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUTPUT_DIR, "01-upload.png") });
  console.log("   ✓ 01-upload.png");

  // ── Step 2: Wait for user to upload their .gnucash file ──────────
  console.log("\n⏳ Waiting for you to upload your .gnucash file in the browser...");
  console.log("   Open http://localhost:3000 and drag-drop your file.\n");

  // Wait until the sidebar appears (meaning data is loaded)
  await page.waitForSelector('aside', { timeout: 300_000 }); // 5 min timeout
  // Give charts a moment to render/animate
  await page.waitForTimeout(2000);
  console.log("   ✓ Data loaded!\n");

  // ── Step 3: Enable privacy mode (blur sensitive values) ──────────
  console.log("🔒 Enabling privacy mode...");
  const privacyBtn = page.locator('button[title="Hide values"]');
  if (await privacyBtn.isVisible()) {
    await privacyBtn.click();
    await page.waitForTimeout(500);
  }

  // ── Step 4: Capture each page (use sidebar links to preserve React state) ─
  const pages = [
    { name: "02-dashboard", label: "Dashboard" },
    { name: "03-spending", label: "Spending" },
    { name: "04-income", label: "Income" },
    { name: "05-investment", label: "Investment" },
  ];

  for (const pg of pages) {
    console.log(`📸 Capturing ${pg.label}...`);

    // Click sidebar link (client-side navigation preserves privacy mode)
    await page.locator(`aside a:has-text("${pg.label}")`).click();
    await page.waitForTimeout(2000); // let charts render/animate

    // Viewport screenshot (above the fold)
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `${pg.name}.png`),
    });
    console.log(`   ✓ ${pg.name}.png`);

    // Full-page screenshot (captures everything with scroll)
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `${pg.name}-full.png`),
      fullPage: true,
    });
    console.log(`   ✓ ${pg.name}-full.png`);
  }

  await browser.close();
  console.log(`\n✅ All screenshots saved to: ${OUTPUT_DIR}/`);
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
