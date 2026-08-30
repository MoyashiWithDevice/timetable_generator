import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  chromePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  outputDir: path.join(__dirname, "slides"),
  perTalkDir: path.join(__dirname, "slides", "per-talk"),
  date: process.env.LT_DATE || "2026.08.29 FRI",
  event: "LT FES",
};

const tokens = (data, index, total) => ({
  "{{DATE}}": CONFIG.date,
  "{{TITLE}}": escapeHtml(data.title || ""),
  "{{HANDLE}}": escapeHtml(data.handleName || ""),
  "{{TAGS}}": (data.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(""),
  "{{SLOT}}": String(index + 1).padStart(2, "0"),
  "{{TOTAL}}": String(total),
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadTemplate(templatePath) {
  let html = await readFile(templatePath, "utf8");
  const css = await readFile(path.join(__dirname, "src", "style.css"), "utf8");
  html = html.replace('<link rel="stylesheet" href="style.css" />', `<style>${css}</style>`);
  return html;
}

function applyTokens(html, map) {
  return Object.entries(map).reduce((acc, [k, v]) => acc.replaceAll(k, v), html);
}

function fileName({ handleName, title }, index) {
  const slug = (handleName || `talk-${index + 1}`).replace(/[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, "_");
  return `${String(index + 1).padStart(2, "0")}_${slug}.png`;
}

async function screenshot(page, html, filePath) {
  await page.setContent(html, { waitUntil: "load" });
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path: filePath, type: "png" });
}

async function main() {
  const schedule = JSON.parse(await readFile(path.join(__dirname, "data", "schedule.json"), "utf8"));
  const total = schedule.length;

  await mkdir(CONFIG.outputDir, { recursive: true });
  await mkdir(CONFIG.perTalkDir, { recursive: true });

  const perTalkHtml = await loadTemplate(path.join(__dirname, "src", "per-talk.html"));
  const ttHtml = await loadTemplate(path.join(__dirname, "src", "timetable.html"));

  const browser = await puppeteer.launch({
    executablePath: CONFIG.chromePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1"],
  });

  try {
    const page = await browser.newPage();

    for (let i = 0; i < total; i++) {
      const talk = schedule[i];
      const map = tokens(talk, i, total);
      const html = applyTokens(perTalkHtml, map);
      const file = path.join(CONFIG.perTalkDir, fileName(talk, i));
      await screenshot(page, html, file);
      console.log(`per-talk: ${file}`);
    }

    const cards = schedule
      .map((talk, i) => {
        const map = tokens(talk, i, total);
        return applyTokens(
          `<div class="tt-card">
            <div class="slot">No.{{SLOT}}</div>
            <div class="handle">{{HANDLE}}</div>
            <div class="title">{{TITLE}}</div>
            <div class="tags">{{TAGS}}</div>
          </div>`,
          map
        );
      })
      .join("\n");

    const ttFull = applyTokens(ttHtml, { "{{TOTAL}}": String(total), "{{DATE}}": CONFIG.date, "{{CARDS}}": cards });
    const ttFile = path.join(CONFIG.outputDir, "timetable.png");
    await screenshot(page, ttFull, ttFile);
    console.log(`timetable: ${ttFile}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
