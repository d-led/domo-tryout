import { execSync } from "child_process";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const domoActorsDir = join(rootDir, "node_modules", "domo-actors");
const tempCloneDir = join(rootDir, ".domo-actors-src");

// Check if dist already exists in node_modules
if (existsSync(join(domoActorsDir, "dist", "index.js"))) {
  console.log("✓ domo-actors dist already exists");
  process.exit(0);
}

// Check if we have source files in node_modules
const srcDir = join(domoActorsDir, "src");
if (existsSync(srcDir)) {
  // Source files are available, build from there
  console.log("🔨 Building domo-actors from source in node_modules...");
  try {
    execSync("npm install", { cwd: domoActorsDir, stdio: "pipe" });
    execSync("npm run build", { cwd: domoActorsDir, stdio: "inherit" });
    console.log("✓ domo-actors built successfully");
    process.exit(0);
  } catch (error) {
    console.error("✗ Failed to build:", error.message);
    process.exit(1);
  }
}

// Source files not in node_modules (npm only includes "files" field from Git)
// Clone the repo temporarily to build it
console.log("📦 Cloning domo-actors to build dist...");

try {
  // Clean up any previous clone
  if (existsSync(tempCloneDir)) {
    rmSync(tempCloneDir, { recursive: true, force: true });
  }
  mkdirSync(tempCloneDir, { recursive: true });

  // Clone the repo (shallow clone for speed)
  execSync(
    "git clone --depth 1 https://github.com/VaughnVernon/DomoActors.git .",
    {
      cwd: tempCloneDir,
      stdio: "pipe",
    },
  );

  // Install and build
  console.log("🔨 Building domo-actors...");
  execSync("npm install", { cwd: tempCloneDir, stdio: "pipe" });
  execSync("npm run build", { cwd: tempCloneDir, stdio: "inherit" });

  // Copy dist and src to node_modules
  const { cpSync } = await import("fs");
  const srcDist = join(tempCloneDir, "dist");
  const srcSrc = join(tempCloneDir, "src");
  const targetDist = join(domoActorsDir, "dist");
  const targetSrc = join(domoActorsDir, "src");

  if (existsSync(srcDist)) {
    cpSync(srcDist, targetDist, { recursive: true });
    console.log("✓ domo-actors dist copied to node_modules");
  }

  if (existsSync(srcSrc)) {
    cpSync(srcSrc, targetSrc, { recursive: true });
    console.log("✓ domo-actors src copied to node_modules");
  }

  // Clean up temp clone
  rmSync(tempCloneDir, { recursive: true, force: true });
} catch (error) {
  console.error("✗ Failed to build domo-actors:", error.message);
  if (existsSync(tempCloneDir)) {
    rmSync(tempCloneDir, { recursive: true, force: true });
  }
  process.exit(1);
}
