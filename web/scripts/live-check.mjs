// End-to-end check against a real backend. Run the web app with NEXT_PUBLIC_API_BASE set, then: node scripts/live-check.mjs
import { chromium } from "playwright-core";
const BASE = process.argv[2] || "http://localhost:3100";
const OUT = new URL("../screenshots/", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
async function tallShot(path) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: 1280, height: h }); await page.waitForTimeout(300);
  await page.screenshot({ path }); await page.setViewportSize({ width: 1280, height: 800 });
}
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const sse = [];
page.on("response", (r) => { if (r.url().includes("/api/stream")) sse.push(`${r.status()} ${r.url()}`); });
page.on("console", (m) => { if (m.type() === "error") console.log("console error:", m.text()); });
await page.goto(`${BASE}/new`, { waitUntil: "networkidle" });
await page.fill("textarea", "My Chase Sapphire card was charged twice for $184.20 at Blue Bottle Coffee on Oct 9. I only placed one order (#BB-20931). Please dispute the duplicate charge.");
await page.click("text=Create case"); await page.waitForURL(/\/cases\//);
console.log("case url:", page.url());
await page.waitForSelector("text=Approve before action", { timeout: 60000 }); await page.waitForTimeout(1000);
console.log("live dot:", await page.locator("text=/^(Live|Polling · 3s|Connecting)$/").first().textContent());
await page.screenshot({ path: OUT + "i-live-backend-approval.png" });
await page.click("button:has-text('Approve')");
await page.waitForSelector("[data-kind='resolved'], [data-kind='reply_received']", { timeout: 60000 }); await page.waitForTimeout(3000);
const btn = page.locator("[data-kind='email_sent'] [data-expand]"); if (await btn.count()) await btn.first().click();
await page.waitForTimeout(500);
await tallShot(OUT + "j-live-backend-timeline.png");
const kinds = await page.$$eval("[data-kind]", (els) => els.map((e) => e.getAttribute("data-kind")));
console.log("timeline kinds:", kinds.join(" > "));
console.log("MOCK badges:", await page.locator("[data-mock-badge]").count(), "| titles still prefixed [MOCK]:",
  await page.locator("[data-kind] span.font-medium", { hasText: "[MOCK]" }).count());
await page.goto(`${BASE}/audit`, { waitUntil: "networkidle" }); await page.waitForSelector("text=Hash chain"); await page.waitForTimeout(800);
await page.screenshot({ path: OUT + "k-live-backend-audit.png" });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" }); await page.waitForTimeout(800);
await page.screenshot({ path: OUT + "l-live-backend-case-list.png" });
console.log("sse responses:", sse);
await browser.close();

