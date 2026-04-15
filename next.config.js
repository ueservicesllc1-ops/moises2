/** @type {import('next').NextConfig} */
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
        destination: `http://127.0.0.1:8000/api/upload/:path*`,
      },
      {
        source: '/backend-audio/:path*',
        destination: `http://127.0.0.1:8000/audio/:path*`,
      }
    ]
  },
}

module.exports = nextConfig
