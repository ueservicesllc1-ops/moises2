/** @type {import('next').NextConfig} */
const nextConfig = {
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
        source: '/api/health',
        destination: `http://127.0.0.1:8000/api/health`,
      },
      {
        source: '/backend-audio/:path*',
        destination: `http://127.0.0.1:8000/audio/:path*`,
      }
    ]
  },
}

module.exports = nextConfig
