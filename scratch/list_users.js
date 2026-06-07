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

async function run() {
  const emailQuery = "ueservicesllc1@gmail.com";
  
  console.log("=== Auth Users ===");
  const listUsersResult = await admin.auth().listUsers(1000);
  let foundAuth = null;
  listUsersResult.users.forEach((userRecord) => {
    if (userRecord.email && userRecord.email.toLowerCase() === emailQuery.toLowerCase()) {
      console.log(`Auth User Found: UID=${userRecord.uid}, Email=${userRecord.email}, Provider=${JSON.stringify(userRecord.providerData.map(p => p.providerId))}`);
      foundAuth = userRecord;
    }
  });

  console.log("\n=== Firestore Users Docs ===");
  const usersSnapshot = await db.collection('users').get();
  usersSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.email && data.email.toLowerCase() === emailQuery.toLowerCase()) {
      console.log(`Firestore Doc Found: ID=${doc.id}, Data=${JSON.stringify(data)}`);
    } else if (doc.id === (foundAuth && foundAuth.uid)) {
      console.log(`Firestore Doc matching Auth UID Found: ID=${doc.id}, Data=${JSON.stringify(data)}`);
    }
  });
}

run().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
