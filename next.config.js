/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost', 'moises2-production.up.railway.app', 'judith.life', 'railway.app', 'github.com'],
  },
  async rewrites() {
    return [
      {
        source: '/api/upload/:path*',
        destination: `http://localhost:8000/api/upload/:path*`,
      },
      {
        source: '/backend-audio/:path*',
        destination: `http://localhost:8000/audio/:path*`,
      }
    ]
  },
}

module.exports = nextConfig
