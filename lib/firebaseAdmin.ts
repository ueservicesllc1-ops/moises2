import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    return JSON.parse(raw)
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
