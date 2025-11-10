import { execSync } from 'child_process'
import { existsSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const domoActorsDir = join(rootDir, 'node_modules', 'domo-actors')
const tempCloneDir = join(rootDir, '.domo-actors-src')

// Check if dist already exists in node_modules
if (existsSync(join(domoActorsDir, 'dist', 'index.js'))) {
  console.log('✓ domo-actors dist already exists')
  process.exit(0)
}

// Check if we have source files in node_modules
const srcDir = join(domoActorsDir, 'src')
if (existsSync(srcDir)) {
  // Source files are available, build from there
  console.log('🔨 Building domo-actors from source in node_modules...')
  try {
    execSync('npm install', { cwd: domoActorsDir, stdio: 'pipe' })
    execSync('npm run build', { cwd: domoActorsDir, stdio: 'inherit' })
    console.log('✓ domo-actors built successfully')
    process.exit(0)
  } catch (error) {
    console.error('✗ Failed to build:', error.message)
    process.exit(1)
  }
}

// Source files not in node_modules
// This happens with npm (but not yarn) - npm respects "files" field even for Git installs
console.log('⚠️  Source files not found in node_modules')
console.log('   npm installs from Git only include files listed in package.json "files" field')
console.log('   Consider using yarn instead: yarn add git+https://github.com/VaughnVernon/DomoActors.git')
console.log('   Or use a local clone: npm install ./path/to/DomoActors')
process.exit(1)

