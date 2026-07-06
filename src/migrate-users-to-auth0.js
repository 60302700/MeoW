import "dotenv/config";
import { MongoClient } from "mongodb";

const AUTH0_ISSUER = process.env.AUTH0_ISSUER_BASE_URL;
const M2M_CLIENT_ID = process.env.AUTH0_M2M_CLIENT_ID;
const M2M_CLIENT_SECRET = process.env.AUTH0_M2M_CLIENT_SECRET;
const CONNECTION_NAME = "Username-Password-Authentication";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "Meow";

async function getManagementToken() {
  const res = await fetch(`${AUTH0_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: M2M_CLIENT_ID,
      client_secret: M2M_CLIENT_SECRET,
      audience: `${AUTH0_ISSUER}/api/v2/`,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Failed to get Management API token: ${data.error_description || data.error}`,
    );
  }
  return data.access_token;
}

async function getConnectionId(token) {
  const res = await fetch(
    `${AUTH0_ISSUER}/api/v2/connections?name=${encodeURIComponent(CONNECTION_NAME)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Failed to look up connection: ${data.message || res.statusText}`,
    );
  }
  if (!data.length) {
    throw new Error(`Connection "${CONNECTION_NAME}" not found on this tenant.`);
  }
  return data[0].id;
}

async function submitImportJob(token, connectionId, users) {
  const form = new FormData();
  form.append(
    "users",
    new Blob([JSON.stringify(users)], { type: "application/json" }),
    "users.json",
  );
  form.append("connection_id", connectionId);

  const res = await fetch(`${AUTH0_ISSUER}/api/v2/jobs/users-imports`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to submit import job: ${data.message || res.statusText}`);
  }
  return data.id;
}

async function pollJob(token, jobId) {
  for (;;) {
    const res = await fetch(`${AUTH0_ISSUER}/api/v2/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Failed to poll job: ${data.message}`);
    if (data.status === "completed" || data.status === "failed") return data;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function getAuth0UserIdByEmail(token, email) {
  const res = await fetch(
    `${AUTH0_ISSUER}/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  if (!res.ok || !data.length) return null;
  return data[0].user_id;
}

async function main() {
  if (!AUTH0_ISSUER || !M2M_CLIENT_ID || !M2M_CLIENT_SECRET) {
    console.error(
      "Missing AUTH0_ISSUER_BASE_URL / AUTH0_M2M_CLIENT_ID / AUTH0_M2M_CLIENT_SECRET in .env",
    );
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB_NAME);
  const Users = db.collection("Users");

  const legacyUsers = await Users.find({
    passwordHash: { $exists: true, $ne: null },
    authSub: { $exists: false },
  }).toArray();

  console.log(`Found ${legacyUsers.length} user(s) to migrate.`);
  if (legacyUsers.length === 0) {
    await client.close();
    return;
  }

  console.log("Requesting Management API token...");
  const token = await getManagementToken();

  console.log(`Looking up connection "${CONNECTION_NAME}"...`);
  const connectionId = await getConnectionId(token);

  const importPayload = legacyUsers.map((u) => ({
    email: u.email,
    email_verified: false,
    name: u.name,
    custom_password_hash: {
      algorithm: "bcrypt",
      hash: { value: u.passwordHash },
    },
  }));

  console.log("Submitting bulk import job...");
  const jobId = await submitImportJob(token, connectionId, importPayload);

  console.log(`Job ${jobId} submitted, polling for completion...`);
  const job = await pollJob(token, jobId);
  console.log(`Job finished with status: ${job.status}`);
  if (job.summary) {
    console.log(
      `  inserted: ${job.summary.inserted}, updated: ${job.summary.updated}, failed: ${job.summary.failed}`,
    );
  }

  console.log("Linking imported Auth0 identities back to Mongo users...");
  let linked = 0;
  let missing = 0;
  for (const u of legacyUsers) {
    const auth0UserId = await getAuth0UserIdByEmail(token, u.email);
    if (!auth0UserId) {
      console.warn(`  no Auth0 user found for ${u.email}, skipping link`);
      missing++;
      continue;
    }
    await Users.updateOne(
      { _id: u._id },
      { $set: { authSub: auth0UserId } },
    );
    linked++;
  }
  console.log(`Linked ${linked} user(s), ${missing} could not be linked.`);

  await client.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
