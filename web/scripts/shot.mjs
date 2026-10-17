// Usage: node scripts/shot.mjs <path> <out.png>  — one 1280x800 screenshot of a page on the running app
import { chromium } from "playwright-core";
const [path, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`http://localhost:3100${path}`, { waitUntil: "networkidle" }); await p.waitForTimeout(2000);
await p.screenshot({ path: new URL(`../screenshots/${out}`, import.meta.url).pathname }); await b.close();
