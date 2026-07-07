import "dotenv/config";

const AUTH0_ISSUER = process.env.AUTH0_ISSUER_BASE_URL;
const M2M_CLIENT_ID = process.env.AUTH0_M2M_CLIENT_ID;
const M2M_CLIENT_SECRET = process.env.AUTH0_M2M_CLIENT_SECRET;

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

// Deletes the Auth0 identity so a closed account can't log back in and have
// getOrCreateUser silently spin up a fresh, empty profile for it.
async function deleteAuth0User(auth0UserId) {
  const token = await getManagementToken();
  const res = await fetch(
    `${AUTH0_ISSUER}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to delete Auth0 user: ${data.message || res.statusText}`,
    );
  }
}

export { getManagementToken, deleteAuth0User };
