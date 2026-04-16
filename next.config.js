/** @type {import('next').NextConfig} */
const backendBase = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(
  /\/$/,
  ''
)

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
