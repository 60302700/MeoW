import {
  connectDB,
  createUser,
  findUserByEmail,
  findUserById,
  findUserByAuthSub,
  linkAuthSub,
  createSession,
  touchSession,
  getSessionBySessionId,
  deleteSession,
  deleteUserAccount,
  getCatByQrCode,
  getCatById,
  getCatsByOwner,
  getCatByName,
  createEmergencyEvent,
  acknowledgeOwnerScan,
  getEmergencyEventById,
  getGuardiansByOwner,
  assignGuardianToEvent,
  createCat,
  addGuardian,
  updateCatById,
  updateGuardianByObjectId,
  setActiveBackupProtocol,
  updateUserProfile,
  createOwnerUnavailability,
  getActiveUnavailability,
  resolveUnavailability,
  getGuardianAccessToken,
  invalidateGuardianTokensByUnavailability,
  declineGuardianToken,
  acknowledgeGuardianToken,
  setGuardianHasAccepted,
  resetGuardiansHasAccepted,
  getGuardian,
  deleteCatById,
  deleteGuardianById,
} from "./persistance.js";
import { sendWalletCardEmail, sendOwnerFoundAlert } from "./mailer.js";
import {
  startOwnerUnavailableWorkflow,
  signalOwnerAvailable,
  signalGuardianAcknowledged,
  signalGuardianDeclined,
} from "./temporal/client.js";

const AUTH0_ISSUER = process.env.AUTH0_ISSUER_BASE_URL;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET;
const AUTH0_M2M_CLIENT_ID = process.env.AUTH0_M2M_CLIENT_ID;
const AUTH0_M2M_CLIENT_SECRET = process.env.AUTH0_M2M_CLIENT_SECRET;
const AUTH0_CONNECTION = "Username-Password-Authentication";

function decodeIdToken(idToken) {
  const payload = idToken.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

// Cats store a date of birth rather than a static age, so age never goes
// stale — it's just arithmetic between dob and "now", recomputed on every
// read. The owner can enter age in whatever unit fits the cat (a kitten in
// weeks, an adult in years); we convert that straight to a dob, then always
// display age back out in whichever unit reads most naturally for its
// current age (a 3-year-old shows "3 years", not "156 weeks").
function ageToDob(amount, unit) {
  const n = parseInt(amount, 10) || 0;
  const dob = new Date();
  switch (unit) {
    case "days":
      dob.setUTCDate(dob.getUTCDate() - n);
      break;
    case "weeks":
      dob.setUTCDate(dob.getUTCDate() - n * 7);
      break;
    case "months":
      dob.setUTCMonth(dob.getUTCMonth() - n);
      break;
    case "years":
    default:
      dob.setUTCFullYear(dob.getUTCFullYear() - n);
      break;
  }
  return dob;
}

function calculateAge(dob) {
  if (!dob) return null;
  const now = new Date();
  const birth = new Date(dob);
  const diffDays = Math.max(Math.floor((now - birth) / 86400000), 0);

  if (diffDays < 14) {
    return { amount: diffDays, unit: diffDays === 1 ? "day" : "days" };
  }
  if (diffDays < 60) {
    const weeks = Math.floor(diffDays / 7);
    return { amount: weeks, unit: weeks === 1 ? "week" : "weeks" };
  }
  if (diffDays < 365) {
    let months =
      (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - birth.getUTCMonth());
    if (now.getUTCDate() < birth.getUTCDate()) months--;
    months = Math.max(months, 1);
    return { amount: months, unit: months === 1 ? "month" : "months" };
  }
  let years = now.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthdayThisYear =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() &&
      now.getUTCDate() >= birth.getUTCDate());
  if (!hadBirthdayThisYear) years--;
  return { amount: years, unit: years === 1 ? "year" : "years" };
}

function withCatAge(cat) {
  if (!cat) return cat;
  const age = calculateAge(cat.dob);
  return {
    ...cat,
    age: age ? age.amount : null,
    ageUnit: age ? age.unit : null,
    ageDisplay: age ? `${age.amount} ${age.unit}` : null,
  };
}

function withCatAges(cats) {
  return cats.map(withCatAge);
}

async function getOrCreateUser({ sub, email, name }) {
  let user = await findUserByAuthSub(sub);
  if (user) return user;

  if (email) {
    user = await findUserByEmail(email);
    if (user) {
      await linkAuthSub(user._id, sub);
      return { ...user, authSub: sub };
    }
  }

  const userId = await createUser({
    name: name || email || "New User",
    email: email || "",
    phone: "",
    authSub: sub,
  });
  return findUserById(userId.toString());
}

async function resolveUserFromSession(sessionId) {
  const session = await getSessionBySessionId(sessionId);
  if (!session) return null;
  return findUserById(session.userId.toString());
}

async function registerUser({ name, email, password, phone }) {
  const signupRes = await fetch(`${AUTH0_ISSUER}/dbconnections/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: AUTH0_CLIENT_ID,
      email,
      password,
      connection: AUTH0_CONNECTION,
      name,
    }),
  });
  const data = await signupRes.json();
  if (!signupRes.ok) {
    throw new Error(
      data.description || data.error_description || "Registration failed.",
    );
  }

  const sub = `auth0|${data._id}`;
  const user = await getOrCreateUser({ sub, email, name });
  if (phone) await updateUserProfile(user._id, { phone });
}

async function authenticateUser(email, password) {
  const tokenRes = await fetch(`${AUTH0_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "http://auth0.com/oauth/grant-type/password-realm",
      username: email,
      password,
      realm: AUTH0_CONNECTION,
      client_id: AUTH0_CLIENT_ID,
      client_secret: AUTH0_CLIENT_SECRET,
      scope: "openid profile email",
    }),
  });
  const data = await tokenRes.json();
  if (!tokenRes.ok) {
    if (
      data.error === "unauthorized_client" ||
      data.error === "access_denied"
    ) {
      throw new Error(
        "Login is not enabled for this Auth0 application yet (Password grant type must be turned on).",
      );
    }
    return null;
  }

  const claims = decodeIdToken(data.id_token);
  const user = await getOrCreateUser({
    sub: claims.sub,
    email: claims.email,
    name: claims.name,
  });
  return createSession(user._id.toString());
}

async function checkSession(sessionId) {
  const session = await getSessionBySessionId(sessionId);
  if (!session) return false;
  await touchSession(sessionId);
  return true;
}

async function logout(sessionId) {
  return await deleteSession(sessionId);
}

async function requestPasswordReset(email) {
  await fetch(`${AUTH0_ISSUER}/dbconnections/change_password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: AUTH0_CLIENT_ID,
      email,
      connection: AUTH0_CONNECTION,
    }),
  });
  // Auth0 always replies 200 here regardless of whether the email exists,
  // so there's no account-enumeration signal to guard against ourselves.
}

async function getCatByNameBusinessLayer(catName, ownerId) {
  return withCatAge(await getCatByName(catName, ownerId));
}

async function getCatInfoForScan(qrCodeId) {
  const cat = await getCatByQrCode(qrCodeId);
  if (!cat) return null;
  const owner = await findUserById(cat.ownerId.toString());
  return { cat: withCatAge(cat), owner };
}

async function handleScan(qrCodeId, finderInfo = {}) {
  const cat = await getCatByQrCode(qrCodeId);
  if (!cat) {
    throw new Error("Invalid Emergency ID. Please try again.");
  }
  const owner = await findUserById(cat.ownerId.toString());
  const guardians = await getGuardiansByOwner(cat.ownerId);

  const { v4: uuidv4 } = await import("uuid");
  const ownerAckToken = uuidv4();

  const eventId = await createEmergencyEvent({
    qrCodeId,
    catId: cat._id,
    finderName: finderInfo.name,
    finderPhone: finderInfo.phone,
    finderLocation: finderInfo.location,
    finderNotes: finderInfo.notes,
    ownerAckToken,
  });

  if (owner?.email) {
    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const ackLink = `${baseUrl}/scan/${eventId}/owner-ack?token=${ownerAckToken}`;
    sendOwnerFoundAlert(
      owner.email,
      owner.name,
      cat.name,
      finderInfo.name || "Someone",
      finderInfo.phone || "",
      finderInfo.location || "",
      ackLink,
    ).catch((err) =>
      console.error("[Mailer] Failed to send owner alert:", err.message),
    );
  }

  return { cat: withCatAge(cat), eventId, guardianCount: guardians.length };
}

async function getEmergencyView(eventId) {
  const event = await getEmergencyEventById(eventId);
  if (!event) {
    throw new Error("Emergency event not found.");
  }
  const cat = await getCatById(event.catId);
  const owner = await findUserById(cat.ownerId.toString());
  const guardians = await getGuardiansByOwner(cat.ownerId);
  return { event, cat: withCatAge(cat), owner, guardians };
}

async function acknowledgeOwnerScanBusiness(eventId, token) {
  const result = await acknowledgeOwnerScan(eventId, token);
  if (!result)
    throw new Error(
      "Acknowledgment failed — link may have already been used or is invalid.",
    );
  return result;
}

async function claimGuardian(eventId, guardianId) {
  // Public endpoint — verify the event exists and the guardian actually
  // belongs to that event's cat owner before assigning, so an arbitrary
  // guardianId can't be used to hijack or prematurely stop an escalation.
  const event = await getEmergencyEventById(eventId);
  if (!event) throw new Error("Emergency event not found.");
  const cat = await getCatById(event.catId);
  if (!cat) throw new Error("Emergency event not found.");
  const guardians = await getGuardiansByOwner(cat.ownerId);
  const isValidGuardian = guardians.some(
    (g) => g._id.toString() === guardianId,
  );
  if (!isValidGuardian)
    throw new Error("Not an authorized guardian for this cat.");
  return assignGuardianToEvent(eventId, guardianId);
}

async function getUserHomepage(sessionId) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) return null;
  const cats = withCatAges(await getCatsByOwner(user._id));
  const guardians = await getGuardiansByOwner(user._id);
  const unavailability = await getActiveUnavailability(user._id.toString());
  return { user, cats, guardians, isUnavailable: !!unavailability };
}

async function getGuardianForOwnerBusinessLayer(sessionId, guardianId) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");

  const guardian = await getGuardian(user._id.toString(), guardianId);
  if (!guardian) throw new Error("Guardian not found or unauthorized");
  return guardian;
}

async function addNewCat(
  sessionId,
  {
    name,
    breed,
    age,
    ageUnit,
    gender,
    photoUrl,
    qrCodeId,
    feedingSchedule,
    foodBrand,
    allergies,
    conditions,
    medications,
    vaccinations,
    neutered,
    vetName,
    vetPhone,
    microchip,
    passportNumber,
    personality,
    notes,
  },
) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");

  return await createCat({
    ownerId: user._id,
    name,
    breed,
    dob: ageToDob(age, ageUnit),
    gender: gender || "",
    photoUrl: photoUrl || "",
    qrCodeId,
    careInstructions: {
      feedingSchedule: feedingSchedule || "",
      foodBrand: foodBrand || "",
      allergies: allergies || "",
      conditions: conditions || "",
      medications: medications || "",
      vaccinations: vaccinations || "",
      neutered: neutered === "yes",
      vetName: vetName || "",
      vetPhone: vetPhone || "",
      microchip: microchip || "",
      passportNumber: passportNumber || "",
      personality: personality || "",
      notes: notes || "",
    },
  });
}

async function addNewGuardian(
  sessionId,
  { name, email, phone, priorityOrder, Id, photoUrl },
) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");

  return await addGuardian({
    ownerId: user._id,
    name,
    phone,
    email,
    priorityOrder: parseInt(priorityOrder, 10) || 1,
    Id,
    photoUrl,
  });
}

async function editGuardian(
  sessionId,
  guardianId,
  { name, email, phone, priorityOrder, photoUrl },
) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");

  const guardian = await getGuardian(user._id.toString(), guardianId);
  if (!guardian) throw new Error("Guardian not found or unauthorized");

  const updates = {
    name,
    email,
    phone,
    priorityOrder: parseInt(priorityOrder, 10) || 1,
  };
  if (photoUrl) updates.photoUrl = photoUrl;

  await updateGuardianByObjectId(guardian._id.toString(), updates);
}

async function editCat(
  sessionId,
  catId,
  {
    name,
    breed,
    age,
    ageUnit,
    gender,
    photoUrl,
    feedingSchedule,
    foodBrand,
    allergies,
    conditions,
    medications,
    vaccinations,
    neutered,
    vetName,
    vetPhone,
    microchip,
    passportNumber,
    personality,
    notes,
  },
) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");
  const cat = await getCatById(catId);
  if (!cat || cat.ownerId.toString() !== user._id.toString())
    throw new Error("Cat not found");

  const updates = {};
  if (photoUrl) updates.photoUrl = photoUrl;
  if (name === undefined) {
    await updateCatById(catId, updates);
    return;
  }
  Object.assign(updates, {
    name,
    breed: breed || "",
    dob: ageToDob(age, ageUnit),
    gender: gender || "",
    "careInstructions.feedingSchedule": feedingSchedule || "",
    "careInstructions.foodBrand": foodBrand || "",
    "careInstructions.allergies": allergies || "",
    "careInstructions.conditions": conditions || "",
    "careInstructions.medications": medications || "",
    "careInstructions.vaccinations": vaccinations || "",
    "careInstructions.neutered": neutered === "yes",
    "careInstructions.vetName": vetName || "",
    "careInstructions.vetPhone": vetPhone || "",
    "careInstructions.microchip": microchip || "",
    "careInstructions.passportNumber": passportNumber || "",
    "careInstructions.personality": personality || "",
    "careInstructions.notes": notes || "",
  });

  await updateCatById(catId, updates);
}

async function toggleCatBackupProtocol(sessionId, catId) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");
  const cat = await getCatById(catId);
  if (!cat || cat.ownerId.toString() !== user._id.toString())
    throw new Error("Cat not found");

  const newStatus = !cat.isActiveBackupProtocol;
  await setActiveBackupProtocol(catId, newStatus);
  return newStatus;
}

async function updateUserPhoto(sessionId, photoUrl) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");
  await updateUserProfile(user._id, { photoUrl });
}

async function updateProfile(sessionId, { name, phone, location }) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");

  const updates = {};
  if (name && name.trim()) updates.name = name.trim();
  if (phone) updates.phone = phone.trim();
  if (location !== undefined) updates.location = location.trim();
  if (Object.keys(updates).length > 0) {
    await updateUserProfile(user._id, updates);
  }
}

async function deleteCat(sessionId, catId) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");
  const cat = await getCatById(catId);
  if (!cat || cat.ownerId.toString() !== user._id.toString())
    throw new Error("Cat not found");
  await deleteCatById(catId, user._id.toString());
}

async function deleteGuardian(sessionId, guardianId) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");
  const guardian = await getGuardian(user._id.toString(), guardianId);
  if (!guardian) throw new Error("Guardian not found or unauthorized");
  await deleteGuardianById(guardianId, user._id.toString());
}

// Auth0 Management API token (client-credentials) for deleting identities.
async function getAuth0ManagementToken() {
  const res = await fetch(`${AUTH0_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: AUTH0_M2M_CLIENT_ID,
      client_secret: AUTH0_M2M_CLIENT_SECRET,
      audience: `${AUTH0_ISSUER}/api/v2/`,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.error_description ||
        data.error ||
        "Auth0 management token request failed.",
    );
  }
  return data.access_token;
}

// Deletes the user's Auth0 identity so a later login can't re-authenticate and
// recreate the local account. Called before local data is removed.
async function deleteAuth0User(authSub) {
  if (!authSub) return; // no linked Auth0 identity — nothing to delete
  if (!AUTH0_M2M_CLIENT_ID || !AUTH0_M2M_CLIENT_SECRET) {
    throw new Error(
      "Account deletion is not fully configured (missing Auth0 management credentials).",
    );
  }
  const token = await getAuth0ManagementToken();
  const res = await fetch(
    `${AUTH0_ISSUER}/api/v2/users/${encodeURIComponent(authSub)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  // 204 = deleted, 404 = already gone; both are fine.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete Auth0 identity (status ${res.status}).`);
  }
}

async function deleteAccount(sessionId) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");
  // Remove the Auth0 identity first — if this fails we abort and keep the
  // local data intact, so the account is never left in a half-deleted state
  // where login could still succeed.
  await deleteAuth0User(user.authSub);
  await deleteUserAccount(user._id.toString());
}

async function setOwnerUnavailable(sessionId) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");

  const existing = await getActiveUnavailability(user._id.toString());
  if (existing) throw new Error("You are already marked as unavailable.");

  const guardians = await getGuardiansByOwner(user._id);
  if (!guardians.length)
    throw new Error(
      "You need at least one guardian before using this feature.",
    );

  const cats = await getCatsByOwner(user._id);
  const catNames = cats.map((c) => c.name);
  const unavailabilityId = await createOwnerUnavailability(user._id.toString());
  const guardianArgs = guardians.map((g) => ({
    id: g._id.toString(),
    email: g.email,
    name: g.name,
  }));

  await startOwnerUnavailableWorkflow(
    unavailabilityId.toString(),
    user._id.toString(),
    user.name,
    guardianArgs,
    catNames,
  );
}

async function setOwnerAvailable(sessionId) {
  const user = await resolveUserFromSession(sessionId);
  if (!user) throw new Error("Unauthorized");

  const record = await getActiveUnavailability(user._id.toString());
  if (!record) return;

  await resolveUnavailability(record._id.toString());
  await signalOwnerAvailable(record._id.toString());
  await invalidateGuardianTokensByUnavailability(record._id.toString());
  await resetGuardiansHasAccepted(user._id.toString());
}

async function getGuardianAccess(token) {
  const record = await getGuardianAccessToken(token);
  if (!record) throw new Error("This link is invalid or has expired.");
  const [cats, owner, guardian] = await Promise.all([
    getCatsByOwner(record.ownerId.toString()),
    findUserById(record.ownerId.toString()),
    getGuardian(record.ownerId.toString(), record.guardianId.toString()),
  ]);
  return {
    record,
    cats: withCatAges(cats),
    ownerName: owner?.name || "Unknown",
    ownerLocation: owner?.location || "",
    guardianName: guardian?.name || "Guardian",
    alreadyAcknowledged: record.acknowledged,
  };
}

async function declineGuardianAccess(token) {
  const record = await getGuardianAccessToken(token);
  if (!record) throw new Error("This link is invalid or has expired.");
  if (record.acknowledged)
    throw new Error("You have already accepted this request.");
  await declineGuardianToken(token);
  await signalGuardianDeclined(record.unavailabilityId.toString());
}

async function acknowledgeGuardianAccess(token) {
  const record = await getGuardianAccessToken(token);
  if (!record) throw new Error("This link is invalid or has expired.");
  if (record.acknowledged) return;
  await acknowledgeGuardianToken(token);
  await signalGuardianAcknowledged(record.unavailabilityId.toString());
  await setGuardianHasAccepted(
    record.ownerId.toString(),
    record.guardianId.toString(),
  );
  await invalidateGuardianTokensByUnavailability(
    record.unavailabilityId.toString(),
    token,
  );

  const [guardian, owner, cats] = await Promise.all([
    getGuardian(record.ownerId.toString(), record.guardianId.toString()),
    findUserById(record.ownerId.toString()),
    getCatsByOwner(record.ownerId.toString()),
  ]);

  if (guardian?.email && owner) {
    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const magicLink = `${baseUrl}/guardian-access?token=${token}`;
    await sendWalletCardEmail(
      guardian.email,
      guardian.name || "Guardian",
      owner,
      withCatAges(cats),
      magicLink,
    );
  }
}

export {
  connectDB,
  registerUser,
  authenticateUser,
  checkSession,
  logout,
  requestPasswordReset,
  getCatInfoForScan,
  handleScan,
  acknowledgeOwnerScanBusiness,
  getEmergencyView,
  claimGuardian,
  getUserHomepage,
  addNewCat,
  addNewGuardian,
  editCat,
  editGuardian,
  toggleCatBackupProtocol,
  updateProfile,
  updateUserPhoto,
  getCatByNameBusinessLayer,
  setOwnerUnavailable,
  setOwnerAvailable,
  getGuardianAccess,
  acknowledgeGuardianAccess,
  declineGuardianAccess,
  deleteAccount,
  getGuardianForOwnerBusinessLayer,
  deleteCat,
  deleteGuardian,
};
