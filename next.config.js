/** @type {import('next').NextConfig} */
/** Alineado con lib/backendUrl.ts (una sola URL; sin fallback encadenado). */
function serverBackendBaseFromEnv() {
  const bad =
    /tu-backend|your-backend|placeholder|example\.com|changeme|replace-me|xxx\.xxx/i
  const loopback = 'http://127.0.0.1:8000'
  const pick = (raw) => {
    const s = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : ''
    if (s && !bad.test(s)) return s
    return null
  }
  const remote =
    process.env.BACKEND_FETCH_MODE === 'remote' ||
    process.env.BACKEND_FETCH_MODE === '1' ||
    process.env.BACKEND_FETCH_MODE === 'true'
  const internalFirst = pick(process.env.BACKEND_INTERNAL_URL)
  if (internalFirst) return internalFirst
  if (remote) {
    return (
      pick(process.env.INTERNAL_BACKEND_URL) ||
      pick(process.env.BACKEND_URL) ||
      pick(process.env.BACKEND_PUBLIC_URL) ||
      loopback
    )
  }
  return loopback
}
const backendBase = serverBackendBaseFromEnv()

const nextConfig = {
  webpack: (config, { dev, isServer }) => {
    // Evita eval-source-map en cliente: bundles enormes (p. ej. Firebase) en una sola línea
    // pueden provocar SyntaxError al parsear en algunos navegadores o con caché corrupta.
    // if (dev && !isServer) {
    //   config.devtool = 'cheap-module-source-map'
    // }
    return config
  },
  images: {
    domains: ['localhost', 'moises2-production.up.railway.app', 'judith.life', 'railway.app', 'github.com'],
  },
  async rewrites() {
    return [
      {
        source: '/api/upload/:path*',
        destination: `${backendBase}/api/upload/:path*`,
      },
      // /backend-audio → app/backend-audio/[...path]/route.ts (usa BACKEND_URL en runtime)
    ]
  },
}

module.exports = nextConfig
