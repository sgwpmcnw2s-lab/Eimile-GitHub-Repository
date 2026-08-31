import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "manifest.json", "dashboard.html", "styles/dashboard.css", "src/background.js",
  "src/dashboard.js", "src/storage.js", "src/fetchers.js", "src/analyzer.js",
  "src/reports.js", "icons/icon.png", "README.md"
];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) throw new Error(`Missing required files: ${missing.join(", ")}`);

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Manifest must use version 3");
if (!manifest.background?.service_worker) throw new Error("Missing service worker");
if (!manifest.permissions.includes("storage")) throw new Error("Missing storage permission");

const node = process.execPath;
const scripts = fs.readdirSync(path.join(root, "src")).filter((name) => name.endsWith(".js"));
for (const script of scripts) execFileSync(node, ["--check", path.join(root, "src", script)], { stdio: "inherit" });

const trackedText = ["manifest.json", ...scripts.map((name) => `src/${name}`)].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
if (/sk-[a-zA-Z0-9_-]{20,}/.test(trackedText)) throw new Error("Potential API key found in source");

console.log(`Validation passed: ${required.length} required files, ${scripts.length} JavaScript modules.`);
