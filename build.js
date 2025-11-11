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
    esbuild.build(cssOptions)
  ])
}

  if (isWatch) {
    const jsCtx = await esbuild.context(jsOptions)
    const cssCtx = await esbuild.context(cssOptions)
    
    await Promise.all([jsCtx.rebuild(), cssCtx.rebuild()])
    copyHtml()
    copySource()
    const { port } = await jsCtx.serve({ servedir: 'dist', port: 8000 })
    console.log(`http://localhost:${port}`)
    
    await Promise.all([jsCtx.watch(), cssCtx.watch()])
    
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
      await Promise.all([jsCtx.dispose(), cssCtx.dispose()])
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

