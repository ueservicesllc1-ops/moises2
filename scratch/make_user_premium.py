import os
import json
import firebase_admin
from firebase_admin import credentials, auth, firestore

def load_env_local(filepath):
    if not os.path.exists(filepath):
        return
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip()

# Load local env vars
load_env_local("e:/moises2/.env.local")

# Get firebase credentials
firebase_sa_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")
if not firebase_sa_json:
    raise ValueError("FIREBASE_SERVICE_ACCOUNT_JSON not found in environment!")

cred = credentials.Certificate(json.loads(firebase_sa_json))
firebase_admin.initialize_app(cred)

db = firestore.client()

email = "ueservicesllc1@gmail.com"
password = "PremiumPassword123!"

try:
    # Try fetching existing user
    user = auth.get_user_by_email(email)
    print(f"User {email} exists with UID: {user.uid}")
except auth.UserNotFoundError:
    # Create user
    user = auth.create_user(
        email=email,
        password=password,
        email_verified=True
    )
    print(f"Created new user {email} with UID: {user.uid} and password: {password}")

# Now update the user document in Firestore to premium
# Let's set the plan to ultra (20000 tokens)
uid = user.uid
user_ref = db.collection("users").document(uid)
user_ref.set({
    "planId": "ultra",
    "tokenBalance": 20000,
    "freeSeparationUsed": False,
    "email": email
}, merge=True)

print(f"Successfully configured user {email} (UID: {uid}) as Premium (planId: ultra, 20000 tokens)")
