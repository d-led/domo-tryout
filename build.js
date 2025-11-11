import * as esbuild from 'esbuild'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs'

const isWatch = process.argv.includes('--watch')

function copyHtml() {
  const src = 'index.html'
  const dest = 'dist/index.html'
  if (existsSync(src)) {
    let content = readFileSync(src, 'utf8')
    // Fix paths for dist
    content = content.replace('src="dist/bundle.js"', 'src="bundle.js"')
    content = content.replace('href="dist/style.css"', 'href="style.css"')
    writeFileSync(dest, content)
  }
}

function copySource() {
  const files = [
    { src: 'src/Counter.ts', dest: 'dist/Counter.ts' },
    { src: 'src/index.ts', dest: 'dist/index.ts' },
    { src: 'src/synced-counter.ts', dest: 'dist/synced-counter.ts' }
  ]
  files.forEach(({ src, dest }) => {
    if (existsSync(src)) {
      copyFileSync(src, dest)
    }
  })
}

async function buildExtractEmbedded() {
  // Build extractEmbedded as a standalone bundle for use in index.html
  await esbuild.build({
    entryPoints: ['src/extract-embedded.ts'],
    bundle: true,
    outfile: 'dist/extract-embedded.js',
    platform: 'browser',
    format: 'iife',
    globalName: 'ExtractEmbedded',
    target: 'es2022',
    loader: {
      '.ts': 'ts',
    },
  })
}

const wsSecret = process.env.WS_SECRET || 'wss-changeme' // Default for local dev

// Plugin to replace secret placeholder
const secretReplacePlugin = {
  name: 'secret-replace',
  setup(build) {
    build.onLoad({ filter: /synced-counter\.ts$/ }, async (args) => {
      const contents = readFileSync(args.path, 'utf8')
      // Replace '__WS_SECRET__' with the actual secret (keeping quotes)
      const replaced = contents.replace(/'__WS_SECRET__'/g, `'${wsSecret}'`)
      return {
        contents: replaced,
        loader: 'ts',
      }
    })
  },
}

const jsOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/bundle.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  sourcemap: true,
  globalName: 'DomoApp',
  loader: {
    '.ts': 'ts',
  },
  alias: {
    'domo-actors': './node_modules/domo-actors/src/actors/index.ts',
  },
  plugins: [secretReplacePlugin],
}

const cssOptions = {
  entryPoints: ['src/style.css'],
  bundle: true,
  outfile: 'dist/style.css',
  loader: {
    '.css': 'css',
  },
}

async function build() {
  await Promise.all([
    esbuild.build(jsOptions),
    esbuild.build(cssOptions),
    buildExtractEmbedded()
  ])
}

  if (isWatch) {
    const jsCtx = await esbuild.context(jsOptions)
    const cssCtx = await esbuild.context(cssOptions)
    
    const extractCtx = await esbuild.context({
      entryPoints: ['src/extract-embedded.ts'],
      bundle: true,
      outfile: 'dist/extract-embedded.js',
      platform: 'browser',
      format: 'iife',
      globalName: 'ExtractEmbedded',
      target: 'es2022',
      loader: {
        '.ts': 'ts',
      },
    })
    
    await Promise.all([jsCtx.rebuild(), cssCtx.rebuild(), extractCtx.rebuild()])
    copyHtml()
    copySource()
    const { port } = await jsCtx.serve({ servedir: 'dist', port: 8000 })
    console.log(`http://localhost:${port}`)
    
    await Promise.all([jsCtx.watch(), cssCtx.watch(), extractCtx.watch()])
    
    // Watch HTML and source files
    const { watch } = await import('fs')
    watch('index.html', () => {
      copyHtml()
      console.log('✓ HTML updated')
    })
    watch('src/index.ts', () => {
      copySource()
      console.log('✓ Source updated')
    })
    watch('src/synced-counter.ts', () => {
      copySource()
      console.log('✓ Source updated')
    })
    
    process.on('SIGINT', async () => {
      await Promise.all([jsCtx.dispose(), cssCtx.dispose(), extractCtx.dispose()])
      process.exit(0)
    })
    
    await new Promise(() => {})
  } else {
  try {
    await build()
    copyHtml()
    copySource()
    console.log('✓ Build complete!')
  } catch (error) {
    console.error('✗ Build failed:', error)
    process.exit(1)
  }
}

