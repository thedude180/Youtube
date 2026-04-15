import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { execSync } from "child_process";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "connect-pg-simple",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-session",
  "memorystore",
  "passport",
  "passport-local",
  "pg",
  "ws",
  "zod",
  "zod-validation-error",
];

const MEDIA_DIRS = ["vault", "clips", "reels", "recordings", "streams", "downloads"];

async function clearMediaDirs() {
  for (const dir of MEDIA_DIRS) {
    try {
      const { readdirSync, unlinkSync, statSync } = await import("fs");
      if (!statSync(dir).isDirectory()) continue;
      const files = readdirSync(dir);
      let cleared = 0;
      for (const f of files) {
        const fp = `${dir}/${f}`;
        try { if (statSync(fp).isFile()) { unlinkSync(fp); cleared++; } } catch {}
      }
      if (cleared > 0) console.log(`cleared ${cleared} files from ${dir}/`);
    } catch {}
  }
}

async function buildAll() {
  console.log("clearing media directories (re-downloadable)...");
  await clearMediaDirs();

  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
    treeShaking: true,
    drop: ["debugger"],
    legalComments: "none",
  });
}

buildAll()
  .then(() => {
    console.log("\nrunning deploy-size check...");
    try {
      execSync("bash scripts/check-deploy-size.sh", { stdio: "inherit" });
    } catch {
      console.error("\n⚠️  Deploy size check FAILED — fix before deploying");
      process.exit(1);
    }

    console.log("\nsyncing to GitHub...");
    try {
      execSync("bash scripts/git-sync.sh", { stdio: "inherit" });
    } catch {
      console.warn("\n⚠️  GitHub sync failed — non-blocking, will retry next build");
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
