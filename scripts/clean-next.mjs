import { rmSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const nextDir = join(root, '.next')

if (existsSync(nextDir)) {
  rmSync(nextDir, { recursive: true, force: true })
  console.log('[clean-next] Carpeta .next eliminada.')
} else {
  console.log('[clean-next] No había carpeta .next.')
}
