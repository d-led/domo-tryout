import * as esbuild from "esbuild";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";

const isWatch = process.argv.includes("--watch");

function copyHtml() {
  const src = "index.html";
  const dest = "dist/index.html";
  if (existsSync(src)) {
    let content = readFileSync(src, "utf8");
    // Fix paths for dist
    content = content.replace('src="dist/bundle.js"', 'src="bundle.js"');
    content = content.replace('href="dist/style.css"', 'href="style.css"');
    // Inject version into footer placeholder
    const version = process.env.VERSION || "dev";
    content = content.replace("_unknown_", version);
    writeFileSync(dest, content);
  }
}

function copySource() {
  const files = [
    { src: "src/Counter.ts", dest: "dist/Counter.ts" },
    { src: "src/index.ts", dest: "dist/index.ts" },
    { src: "src/synced-counter.ts", dest: "dist/synced-counter.ts" },
  ];
  files.forEach(({ src, dest }) => {
    if (existsSync(src)) {
      copyFileSync(src, dest);
    }
  });
}

async function buildExtractEmbedded() {
  // Build extractEmbedded as a standalone bundle for use in index.html
  await esbuild.build({
    entryPoints: ["src/extract-embedded.ts"],
    bundle: true,
    outfile: "dist/extract-embedded.js",
    platform: "browser",
    format: "iife",
    globalName: "ExtractEmbedded",
    target: "es2022",
    loader: {
      ".ts": "ts",
    },
  });
}

const wsSecret = process.env.WS_SECRET || "wss-changeme"; // Default for local dev
const wsServerUrl = process.env.WS_SERVER_URL || ""; // Render.com WebSocket server URL for production

// Debug logging
if (process.env.CI) {
  console.log("Build environment:");
  console.log("  WS_SECRET:", wsSecret ? "***set***" : "NOT SET");
  console.log("  WS_SERVER_URL:", wsServerUrl || "NOT SET");
}

// Plugin to replace placeholders
const replacePlugin = {
  name: "replace",
  setup(build) {
    build.onLoad({ filter: /synced-counter\.ts$/ }, async (args) => {
      let contents = readFileSync(args.path, "utf8");
      // Replace '__WS_SECRET__' with the actual secret (keeping quotes)
      contents = contents.replace(/'__WS_SECRET__'/g, `'${wsSecret}'`);
      // Replace '__WS_SERVER_URL__' with the actual server URL (convert https:// to wss://)
      if (wsServerUrl) {
        const wssUrl = wsServerUrl.replace(/^https?:\/\//, "wss://");
        // Replace '__WS_SERVER_URL__' with the actual URL (without quotes, they're already in source)
        // Need to replace both the string literal and any other occurrences
        contents = contents.replace(/__WS_SERVER_URL__/g, wssUrl);
        console.log(
          `Replaced __WS_SERVER_URL__ with: ${wssUrl.substring(0, 50)}...`,
        );
      } else {
        // For local dev, replace with empty string so it falls back to localhost via ||
        contents = contents.replace(/__WS_SERVER_URL__/g, "");
        console.log("Replaced __WS_SERVER_URL__ with empty string (local dev)");
      }
      return {
        contents,
        loader: "ts",
      };
    });
  },
};

const jsOptions = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/bundle.js",
  platform: "browser",
  format: "iife",
  target: "es2022",
  sourcemap: true,
  globalName: "DomoApp",
  loader: {
    ".ts": "ts",
  },
  plugins: [replacePlugin],
};

const cssOptions = {
  entryPoints: ["src/style.css"],
  bundle: true,
  outfile: "dist/style.css",
  loader: {
    ".css": "css",
  },
};

async function build() {
  await Promise.all([
    esbuild.build(jsOptions),
    esbuild.build(cssOptions),
    buildExtractEmbedded(),
  ]);
}

if (isWatch) {
  const jsCtx = await esbuild.context(jsOptions);
  const cssCtx = await esbuild.context(cssOptions);

  const extractCtx = await esbuild.context({
    entryPoints: ["src/extract-embedded.ts"],
    bundle: true,
    outfile: "dist/extract-embedded.js",
    platform: "browser",
    format: "iife",
    globalName: "ExtractEmbedded",
    target: "es2022",
    loader: {
      ".ts": "ts",
    },
  });

  await Promise.all([jsCtx.rebuild(), cssCtx.rebuild(), extractCtx.rebuild()]);
  copyHtml();
  copySource();
  const { port } = await jsCtx.serve({ servedir: "dist", port: 8000 });
  console.log(`http://localhost:${port}`);

  await Promise.all([jsCtx.watch(), cssCtx.watch(), extractCtx.watch()]);

  // Watch HTML and source files
  const { watch } = await import("fs");
  watch("index.html", () => {
    copyHtml();
    console.log("✓ HTML updated");
  });
  watch("src/index.ts", () => {
    copySource();
    console.log("✓ Source updated");
  });
  watch("src/synced-counter.ts", () => {
    copySource();
    console.log("✓ Source updated");
  });

  process.on("SIGINT", async () => {
    await Promise.all([
      jsCtx.dispose(),
      cssCtx.dispose(),
      extractCtx.dispose(),
    ]);
    process.exit(0);
  });

  await new Promise(() => {});
} else {
  try {
    await build();
    copyHtml();
    copySource();
    console.log("✓ Build complete!");
  } catch (error) {
    console.error("✗ Build failed:", error);
    process.exit(1);
  }
}
