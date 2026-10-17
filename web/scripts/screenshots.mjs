// Usage: node scripts/screenshots.mjs [baseUrl]  — needs the app running (default http://localhost:3100)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const BASE = process.argv[2] || "http://localhost:3100";
const OUT = new URL("../screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const executablePath = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const settle = () => page.waitForTimeout(1200);

await page.goto(`${BASE}/`, { waitUntil: "networkidle" }); await page.waitForSelector("a[href^='/cases/']"); await settle();
await page.screenshot({ path: OUT + "a-case-list.png" });

await page.goto(`${BASE}/cases/case_ups`, { waitUntil: "networkidle" }); await page.waitForSelector("[data-kind='call_placed']");
await page.click("[data-kind='call_placed'] [data-expand]"); await settle();
await page.screenshot({ path: OUT + "b-case-detail-transcript-full.png", fullPage: true });
await page.evaluate(() => { const el = document.querySelector("[data-kind='call_placed']"); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 150); });
await settle();
await page.screenshot({ path: OUT + "b-case-detail-transcript.png" });

await page.goto(`${BASE}/cases/case_chase`, { waitUntil: "networkidle" }); await page.waitForSelector("text=Approve before action"); await settle();
await page.screenshot({ path: OUT + "c-pending-approval.png" });

await page.goto(`${BASE}/new`, { waitUntil: "networkidle" }); await page.click("text=Double charge"); await settle();
await page.screenshot({ path: OUT + "d-submit-claim.png" });

// e: live progress — submit a claim and capture the timeline mid-simulation
if (!process.env.SKIP_LIVE) {
  await page.click("text=Create case"); await page.waitForURL(/\/cases\//);
  await page.waitForSelector("text=Approve before action", { timeout: 20000 }); await settle();
  await page.screenshot({ path: OUT + "e-new-case-awaiting-approval.png" });
  await page.click("button:has-text('Approve')");
  await page.waitForSelector("[data-kind='email_sent']", { timeout: 20000 }); await settle();
  await page.screenshot({ path: OUT + "f-after-approval-live.png", fullPage: true });
}
await browser.close();
console.log("saved to", OUT);
