#!/usr/bin/env node
/**
 * Proxy local CORS (dev).
 * - GET /api/download?url=<https B2 público> → reenvía solo a hosts B2 permitidos
 * - GET /file/<bucket>/… → https://f005.backblazeb2.com/file/…
 *
 * Puerto: B2_PROXY_PORT o 3001.
 */
import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

const PORT = Number(process.env.B2_PROXY_PORT || process.env.PORT || 3001)
const B2_ORIGIN = 'https://f005.backblazeb2.com'

function isAllowedB2DownloadUrl(raw) {
  try {
    const u = new URL(String(raw).trim())
    if (u.protocol !== 'https:') return false
    const h = u.hostname.toLowerCase()
    if (h === 'f005.backblazeb2.com') return true
    if (h === 's3.us-east-005.backblazeb2.com') return true
    return false
  } catch {
    return false
  }
}

const UPSTREAM_USER_AGENT = 'MoisesStudio/1.0 (b2-proxy local)'

function forwardRequestHeaders(incoming) {
  const out = {}
  const allow = new Set(['range', 'if-none-match', 'if-modified-since', 'accept', 'user-agent'])
  for (const [k, v] of Object.entries(incoming)) {
    if (v == null || k === 'host') continue
    if (allow.has(k.toLowerCase())) out[k] = v
  }
  if (!out['User-Agent'] && !out['user-agent']) {
    out['User-Agent'] = UPSTREAM_USER_AGENT
  }
  return out
}

function stripHopByHop(h) {
  const drop = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
  ])
  const out = {}
  for (const [k, v] of Object.entries(h)) {
    if (!drop.has(k.toLowerCase()) && v != null) out[k] = v
  }
  return out
}

function sendCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || 'Range, Accept, Content-Type'
  )
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Type, Accept-Ranges, Content-Range, ETag, Last-Modified'
  )
}

function proxyHttpsUrl(targetUrl, req, res) {
  let parsed
  try {
    parsed = new URL(targetUrl)
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('URL inválida')
  }

  const pathForLog = (parsed.pathname + parsed.search).slice(0, 160)
  const headerTimeoutMs = Number(process.env.B2_PROXY_HEADER_TIMEOUT_MS || 60_000)

  const opts = {
    hostname: parsed.hostname,
    port: parsed.port || 443,
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers: {
      ...forwardRequestHeaders(req.headers),
      Host: parsed.hostname,
    },
  }

  let headerTimer
  const pReq = https.request(opts, (pRes) => {
    clearTimeout(headerTimer)
    const code = pRes.statusCode || 0
    if (code >= 400) {
      console.error('[b2-proxy] B2 respondió', code, parsed.hostname, pathForLog)
    }
    const headers = stripHopByHop(pRes.headers)
    headers['access-control-allow-origin'] = '*'
    headers['access-control-expose-headers'] =
      'Content-Length, Content-Type, Accept-Ranges, Content-Range, ETag, Last-Modified'
    res.writeHead(code || 502, headers)
    pRes.pipe(res)
  })

  pReq.on('error', (err) => {
    clearTimeout(headerTimer)
    const code = err?.code || ''
    console.error('[b2-proxy] error upstream', code || '(sin code)', err?.message || err, pathForLog)
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    }
    res.end(String(err?.message || err))
  })

  headerTimer = setTimeout(() => {
    console.error('[b2-proxy] timeout esperando cabeceras de B2', parsed.hostname, pathForLog)
    pReq.destroy(new Error('Tiempo de espera agotado al conectar con B2 (revisa red / firewall / VPN).'))
  }, headerTimeoutMs)

  pReq.end()
}

const server = http.createServer((req, res) => {
  sendCors(req, res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  if (req.url === '/health' || req.url === '/health/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, service: 'b2-proxy', port: PORT }))
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    return res.end('Method Not Allowed')
  }

  let fullUrl
  try {
    fullUrl = new URL(req.url || '/', 'http://127.0.0.1')
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('Petición URL inválida')
  }

  const pathname = fullUrl.pathname.replace(/\/$/, '') || '/'

  if (pathname === '/api/download') {
    let raw = fullUrl.searchParams.get('url')
    if (raw == null || raw === '') {
      const q = (req.url || '').indexOf('?')
      if (q !== -1) {
        const sp = new URLSearchParams(req.url.slice(q + 1))
        raw = sp.get('url')
      }
    }
    if (raw == null || String(raw).trim() === '') {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('Falta query ?url=')
    }
    // searchParams.get ya devuelve el valor decodificado; no llamar decodeURIComponent de nuevo (puede lanzar URIError → 400).
    let decoded = String(raw).trim()
    try {
      if (/%[0-9A-Fa-f]{2}/.test(decoded)) {
        decoded = decodeURIComponent(decoded)
      }
    } catch {
      /* usar decoded tal cual */
    }
    if (!isAllowedB2DownloadUrl(decoded)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('Solo URLs https de Backblaze B2 públicas')
    }
    return proxyHttpsUrl(decoded, req, res)
  }

  const pathAndQuery = (req.url || '/').split('#')[0]
  if (!pathAndQuery.startsWith('/file/')) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('Usa /api/download?url=… o /file/<bucket>/…')
  }

  const upstreamUrl = B2_ORIGIN + pathAndQuery
  return proxyHttpsUrl(upstreamUrl, req, res)
})

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`[b2-proxy] El puerto ${PORT} ya está en uso (¿ya corre "npm run dev" u otro b2-proxy?).`)
    console.error('[b2-proxy] Cierra ese proceso o define otra variable B2_PROXY_PORT.')
    process.exit(1)
  }
  throw err
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[b2-proxy] escuchando http://127.0.0.1:${PORT}`)
  console.log(`[b2-proxy] health http://127.0.0.1:${PORT}/health`)
  console.log(`[b2-proxy] download http://127.0.0.1:${PORT}/api/download?url=…`)
})
