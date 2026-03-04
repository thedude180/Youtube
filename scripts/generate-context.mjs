import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MAX_LINES = 150;

function readFileTruncated(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    return `[FILE NOT FOUND: ${relPath}]`;
  }
  const content = fs.readFileSync(fullPath, "utf8");
  const lines = content.split("\n");
  if (lines.length <= MAX_LINES) {
    return content;
  }
  return (
    lines.slice(0, MAX_LINES).join("\n") +
    `\n\n... [truncated at ${MAX_LINES} lines — full file is ${lines.length} lines] ...`
  );
}

function readFileFull(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    return `[FILE NOT FOUND: ${relPath}]`;
  }
  return fs.readFileSync(fullPath, "utf8");
}

const SKIP_DIRS = new Set([
  "node_modules", "dist", ".cache", ".local", ".git",
  "build", "coverage", "__pycache__", ".nyc_output",
]);

const SKIP_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp4", ".mp3", ".wav", ".webm",
  ".zip", ".tar", ".gz",
  ".lock",
]);

function buildTree(dirPath, prefix = "", relBase = "") {
  let result = "";
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return "";
  }

  entries = entries.filter((e) => {
    if (SKIP_DIRS.has(e.name)) return false;
    if (e.name.startsWith(".")) return false;
    if (!e.isDirectory() && SKIP_EXTENSIONS.has(path.extname(e.name).toLowerCase())) return false;
    return true;
  });

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;

    result += `${prefix}${connector}${entry.name}\n`;

    if (entry.isDirectory()) {
      result += buildTree(path.join(dirPath, entry.name), prefix + childPrefix, rel);
    }
  }
  return result;
}

const SOURCE_FILES = [
  "shared/schema.ts",
  "server/db.ts",
  "server/index.ts",
  "server/storage.ts",
  "server/routes/helpers.ts",
  "server/routes/content.ts",
  "server/routes/stream.ts",
  "server/routes/money.ts",
  "server/routes/upgrades.ts",
  "server/routes/fortress.ts",
  "server/lib/security-hardening.ts",
  "server/lib/openai.ts",
  "server/stripeClient.ts",
  "server/services/agent-orchestrator.ts",
  "server/services/stream-agent.ts",
  "server/services/usage-metering.ts",
  "server/services/webhook-verify.ts",
  "server/services/stripe-hardening.ts",
  "server/vod-optimizer-engine.ts",
  "server/stealth-guardrails.ts",
  "server/ai-engine.ts",
  "client/src/App.tsx",
  "client/src/lib/queryClient.ts",
  "client/src/lib/offline-engine.ts",
  "client/src/hooks/use-login-sync.ts",
];

const TREE_DIRS = ["shared", "server", "client/src"];

const now = new Date().toISOString();

let out = "";

out += `# CreatorOS — Full Codebase Context\n`;
out += `\nGenerated: ${now}\n\n`;
out += `---\n\n`;
out += `This file is a self-contained snapshot of the CreatorOS codebase, assembled for analysis by ChatGPT or similar AI tools. It includes the project overview, a directory tree, the most important source files (truncated at ${MAX_LINES} lines each), and the full audit report.\n\n`;
out += `---\n\n`;

out += `# 1. Project Overview\n\n`;
out += readFileFull("replit.md");
out += `\n\n---\n\n`;

out += `# 2. Directory Tree\n\n`;
out += `\`\`\`\n`;
for (const dir of TREE_DIRS) {
  const fullDir = path.join(ROOT, dir);
  if (fs.existsSync(fullDir)) {
    out += `${dir}/\n`;
    out += buildTree(fullDir, "");
    out += `\n`;
  }
}
out += `\`\`\`\n\n---\n\n`;

out += `# 3. Key Source Files\n\n`;
for (const relPath of SOURCE_FILES) {
  const fullPath = path.join(ROOT, relPath);
  const ext = path.extname(relPath).replace(".", "") || "text";
  const lang = ext === "ts" || ext === "tsx" ? "typescript" : ext === "mjs" || ext === "js" ? "javascript" : "text";
  const totalLines = fs.existsSync(fullPath)
    ? fs.readFileSync(fullPath, "utf8").split("\n").length
    : 0;

  out += `## FILE: ${relPath}\n`;
  if (totalLines > MAX_LINES) {
    out += `> ${totalLines} lines total — showing first ${MAX_LINES} lines\n\n`;
  }
  out += `\`\`\`${lang}\n`;
  out += readFileTruncated(relPath);
  out += `\n\`\`\`\n\n`;
}

out += `---\n\n`;
out += `# 4. Audit Report\n\n`;
out += readFileFull("audit-report.md");
out += `\n`;

const outputPath = path.join(ROOT, "codebase-context.md");
fs.writeFileSync(outputPath, out, "utf8");

const charCount = out.length;
const lineCount = out.split("\n").length;

console.log(`\n✅ codebase-context.md written successfully`);
console.log(`   Characters : ${charCount.toLocaleString()}`);
console.log(`   Lines      : ${lineCount.toLocaleString()}`);
console.log(`   Path       : ${outputPath}`);
