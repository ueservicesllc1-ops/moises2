const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Load .env.local
const dotenv = require('dotenv');
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const firebaseServiceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!firebaseServiceAccountStr) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON not found in environment!");
  process.exit(1);
}

const serviceAccount = JSON.parse(firebaseServiceAccountStr);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const email = "ueservicesllc1@gmail.com";
const password = "PremiumPassword123!";

async function run() {
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
    console.log(`User ${email} already exists with UID: ${user.uid}`);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      user = await admin.auth().createUser({
        email: email,
        password: password,
        emailVerified: true
      });
      console.log(`Created new user ${email} with UID: ${user.uid} and default password: ${password}`);
    } else {
      throw error;
    }
  }

  // Update/Set document in users collection
  const userRef = db.collection('users').doc(user.uid);
  await userRef.set({
    planId: 'ultra',
    tokenBalance: 20000,
    freeSeparationUsed: false,
    email: email
  }, { merge: true });

  console.log(`Successfully configured user ${email} (UID: ${user.uid}) as Premium (planId: ultra, 20000 tokens)`);
}

run().catch(err => {
  console.error("Error setting user premium:", err);
  process.exit(1);
});
