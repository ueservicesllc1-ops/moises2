/** @type {import('next').NextConfig} */
function serverBackendBaseFromEnv() {
  const candidates = [
    process.env.INTERNAL_BACKEND_URL,
    process.env.BACKEND_URL,
    process.env.NEXT_PUBLIC_API_URL,
  ]
  for (const c of candidates) {
    const s = typeof c === 'string' ? c.trim() : ''
    if (s && !/tu-backend|your-backend|placeholder|example\.com/i.test(s)) {
      return s.replace(/\/$/, '')
    }
  }
  return 'http://127.0.0.1:8000'
}
const backendBase = serverBackendBaseFromEnv()

const nextConfig = {
  webpack: (config, { dev, isServer }) => {
    // Evita eval-source-map en cliente: bundles enormes (p. ej. Firebase) en una sola línea
    // pueden provocar SyntaxError al parsear en algunos navegadores o con caché corrupta.
    if (dev && !isServer) {
      config.devtool = 'cheap-module-source-map'
    }
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
