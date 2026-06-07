import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

function getServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    let parsed: any;
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      // Intento de corregir si la variable tiene saltos de línea literales
      let sanitized = raw.replace(/\r?\n/g, '\\n')
      // Intento de corregir si tiene comillas simples
      if (sanitized.startsWith("'") && sanitized.endsWith("'")) {
        sanitized = sanitized.substring(1, sanitized.length - 1)
      }
      parsed = JSON.parse(sanitized)
    }
    
    if (parsed && parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')
    }
    return parsed
  } catch (error) {
    console.error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', error)
    return null
  }
}

export function getAdminDb() {
  if (!getApps().length) {
    const serviceAccount = getServiceAccountFromEnv()
    if (serviceAccount) {
      initializeApp({
        credential: cert(serviceAccount),
      })
    } else {
      initializeApp()
    }
  }
  return getFirestore()
}

export function getAdminAuth() {
  if (!getApps().length) {
    const serviceAccount = getServiceAccountFromEnv()
    if (serviceAccount) {
      initializeApp({
        credential: cert(serviceAccount),
      })
    } else {
      initializeApp()
    }
  }
  return getAuth()
}
