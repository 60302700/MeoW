import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "Meow";

if (!uri) {
  throw new Error("MONGODB_URI is not set. Add it to your .env file.");
}

const client = new MongoClient(uri);
let db = null;

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db(dbName);
    await db
      .collection("Sessions")
      .createIndex({ lastActivity: 1 }, { expireAfterSeconds: 30 * 60 });
    await db
      .collection("PasswordResetTokens")
      .createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 });
    await db
      .collection("GuardianAccessTokens")
      .createIndex({ createdAt: 1 }, { expireAfterSeconds: 48 * 60 * 60 });
    console.log("Connected to MongoDB");
  }
  return db;
}

function collections() {
  return {
    Users: db.collection("Users"),
    Cats: db.collection("Cats"),
    Guardians: db.collection("Guardians"),
    EmergencyEvents: db.collection("EmergencyEvents"),
    Sessions: db.collection("Sessions"),
    PasswordResetTokens: db.collection("PasswordResetTokens"),
    GuardianAccessTokens: db.collection("GuardianAccessTokens"),
    OwnerUnavailability: db.collection("OwnerUnavailability"),
  };
}

// ---- Users ----

async function createUser({ name, email, passwordHash, phone }) {
  const { Users } = collections();
  const result = await Users.insertOne({
    name,
    email,
    passwordHash,
    phone,
    createdAt: new Date(),
  });
  return result.insertedId;
}

async function findUserByEmail(email) {
  const { Users } = collections();
  return Users.findOne({ email });
}

async function findUserById(userId) {
  const { Users } = collections();
  return Users.findOne({ _id: new ObjectId(userId) });
}

async function updateUserPassword(email, passwordHash) {
  const { Users } = collections();
  await Users.updateOne({ email }, { $set: { passwordHash } });
}

async function updateUserProfile(userId, updates) {
  const { Users } = collections();
  await Users.updateOne({ _id: new ObjectId(userId) }, { $set: updates });
}

async function Authenticate(email, password) {
  const { Users } = collections();
  const user = await Users.findOne({ email: email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return false;
  }
  return true;
}
// ---- Cats ----

async function createCat({
  ownerId,
  name,
  breed,
  age,
  gender,
  photoUrl,
  careInstructions,
  qrCodeId,
}) {
  const { Cats } = collections();
  const result = await Cats.insertOne({
    ownerId: new ObjectId(ownerId),
    name,
    breed,
    age,
    gender: gender || "",
    photoUrl,
    careInstructions,
    qrCodeId,
    isActiveBackupProtocol: false,
  });
  return result.insertedId;
}

async function getCatByQrCode(qrCodeId) {
  const { Cats } = collections();
  return Cats.findOne({ qrCodeId });
}

async function getCatById(catId) {
  const { Cats } = collections();
  return Cats.findOne({ _id: new ObjectId(catId) });
}

async function getCatsByOwner(ownerId) {
  const { Cats } = collections();
  return Cats.find({ ownerId: new ObjectId(ownerId) }).toArray();
}

async function getCatByName(catName, ownerId) {
  const { Cats } = collections();
  const query = { name: catName };
  if (ownerId) query.ownerId = new ObjectId(ownerId);
  return Cats.findOne(query);
}

async function updateCatById(catId, updates) {
  const { Cats } = collections();
  await Cats.updateOne({ _id: new ObjectId(catId) }, { $set: updates });
}

async function setActiveBackupProtocol(catId, isActive) {
  const { Cats } = collections();
  await Cats.updateOne(
    { _id: new ObjectId(catId) },
    { $set: { isActiveBackupProtocol: isActive } },
  );
}

// ---- Guardians ----

async function addGuardian({
  ownerId,
  name,
  phone,
  email,
  priorityOrder,
  Id,
  photoUrl,
}) {
  const { Guardians } = collections();
  const result = await Guardians.insertOne({
    ownerId: new ObjectId(ownerId),
    name,
    phone,
    email,
    priorityOrder,
    hasAccepted: false,
    Id: Id || null,
    photoUrl: photoUrl || "",
  });
  return result.insertedId;
}

async function getGuardiansByOwner(ownerId) {
  const { Guardians } = collections();
  return Guardians.find({ ownerId: new ObjectId(ownerId) })
    .sort({ priorityOrder: 1 })
    .toArray();
}

// ---- Emergency Events ----

async function createEmergencyEvent({ qrCodeId, catId, responderGeo }) {
  const { EmergencyEvents } = collections();
  const result = await EmergencyEvents.insertOne({
    qrCodeId,
    catId: new ObjectId(catId),
    triggeredAt: new Date(),
    responderGeo: responderGeo || null,
    status: "ALERTED",
    assignedGuardianId: null,
  });
  return result.insertedId;
}

async function getEmergencyEventById(eventId) {
  const { EmergencyEvents } = collections();
  return EmergencyEvents.findOne({ _id: new ObjectId(eventId) });
}

async function assignGuardianToEvent(eventId, guardianId) {
  const { EmergencyEvents } = collections();
  await EmergencyEvents.updateOne(
    { _id: new ObjectId(eventId) },
    {
      $set: {
        assignedGuardianId: new ObjectId(guardianId),
        status: "GUARDIAN_RESPONDED",
      },
    },
  );
}

async function createSession(email) {
  const { Sessions } = collections();
  const sessionValue = uuidv4();
  await Sessions.insertOne({
    email,
    sessionId: sessionValue,
    createdAt: new Date(),
    lastActivity: new Date(),
  });
  return sessionValue;
}

async function touchSession(sessionId) {
  const { Sessions } = collections();
  await Sessions.updateOne(
    { sessionId },
    { $set: { lastActivity: new Date() } },
  );
}

async function getSessionBySessionId(sessionId) {
  const { Sessions } = collections();
  return Sessions.findOne({ sessionId: sessionId });
}

async function deleteSession(sessionId) {
  const { Sessions } = collections();
  await Sessions.deleteOne({ sessionId: sessionId });
}

// ---- searhc function ----

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function searchUsersByName(name) {
  const { Users } = collections();
  const query = name ? escapeRegex(name.trim()) : "";
  return Users.find(
    { name: { $regex: query, $options: "i" } },
  )
    .project({ _id: 1, name: 1, email: 1, phone: 1 })
    .limit(20)
    .toArray();
}

async function deleteUserAccount(userId, email) {
  const {
    Users,
    Cats,
    Guardians,
    EmergencyEvents,
    Sessions,
    PasswordResetTokens,
    GuardianAccessTokens,
    OwnerUnavailability,
  } = collections();
  const oid = new ObjectId(userId);
  const cats = await Cats.find(
    { ownerId: oid },
    { projection: { _id: 1 } },
  ).toArray();
  const catIds = cats.map((c) => c._id);
  await Promise.all([
    Users.deleteOne({ _id: oid }),
    Cats.deleteMany({ ownerId: oid }),
    Guardians.deleteMany({ ownerId: oid }),
    EmergencyEvents.deleteMany({ catId: { $in: catIds } }),
    Sessions.deleteMany({ email }),
    PasswordResetTokens.deleteMany({ email }),
    GuardianAccessTokens.deleteMany({ ownerId: oid }),
    OwnerUnavailability.deleteMany({ ownerId: oid }),
  ]);
}

// ---- Owner Unavailability ----

async function createOwnerUnavailability(ownerId) {
  const { OwnerUnavailability } = collections();
  await OwnerUnavailability.updateMany(
    { ownerId: new ObjectId(ownerId), status: "active" },
    { $set: { status: "resolved" } },
  );
  const result = await OwnerUnavailability.insertOne({
    ownerId: new ObjectId(ownerId),
    status: "active",
    createdAt: new Date(),
  });
  return result.insertedId;
}

async function getActiveUnavailability(ownerId) {
  const { OwnerUnavailability } = collections();
  return OwnerUnavailability.findOne({
    ownerId: new ObjectId(ownerId),
    status: "active",
  });
}

async function resolveUnavailability(unavailabilityId) {
  const { OwnerUnavailability } = collections();
  await OwnerUnavailability.updateOne(
    { _id: new ObjectId(unavailabilityId) },
    { $set: { status: "resolved" } },
  );
}

// ---- Guardian Access Tokens ----

async function createGuardianAccessToken(
  unavailabilityId,
  guardianId,
  ownerId,
) {
  const { GuardianAccessTokens } = collections();
  const token = uuidv4();
  await GuardianAccessTokens.insertOne({
    token,
    unavailabilityId: new ObjectId(unavailabilityId),
    guardianId: new ObjectId(guardianId),
    ownerId: new ObjectId(ownerId),
    acknowledged: false,
    createdAt: new Date(),
  });
  return token;
}

async function getGuardianAccessToken(token) {
  const { GuardianAccessTokens } = collections();
  const record = await GuardianAccessTokens.findOne({ token });
  if (!record) return null;
  const ageHours = (Date.now() - new Date(record.createdAt).getTime()) / 36e5;
  if (ageHours > 48) return null;
  return record;
}

async function acknowledgeGuardianToken(token) {
  const { GuardianAccessTokens } = collections();
  return GuardianAccessTokens.findOneAndUpdate(
    { token },
    { $set: { acknowledged: true, acknowledgedAt: new Date() } },
    { returnDocument: "after" },
  );
}

// ---- Password Reset Tokens ----

async function createPasswordResetToken(email) {
  const { PasswordResetTokens } = collections();
  await PasswordResetTokens.deleteMany({ email }); // clear any old tokens
  const token = uuidv4();
  await PasswordResetTokens.insertOne({ email, token, createdAt: new Date() });
  return token;
}

async function getPasswordResetToken(token) {
  const { PasswordResetTokens } = collections();
  return PasswordResetTokens.findOne({ token });
}

async function deletePasswordResetToken(token) {
  const { PasswordResetTokens } = collections();
  await PasswordResetTokens.deleteOne({ token });
}


async function updateGuardianByObjectId(guardianId, updates) {
  const { Guardians } = collections();
  await Guardians.updateOne(
    { _id: new ObjectId(guardianId) },
    { $set: updates },
  );
}

async function getGuardian(ownerId, guardianId) {
  const { Guardians } = collections();
  return Guardians.findOne({
    _id: new ObjectId(guardianId),
    ownerId: new ObjectId(ownerId),
  });
}

async function deleteCatById(catId, ownerId) {
  const { Cats, EmergencyEvents } = collections();
  await EmergencyEvents.deleteMany({ catId: new ObjectId(catId) });
  await Cats.deleteOne({ _id: new ObjectId(catId), ownerId: new ObjectId(ownerId) });
}

async function deleteGuardianById(guardianId, ownerId) {
  const { Guardians } = collections();
  await Guardians.deleteOne({ _id: new ObjectId(guardianId), ownerId: new ObjectId(ownerId) });
}

export {
  connectDB,
  createUser,
  findUserByEmail,
  findUserById,
  createCat,
  getCatByQrCode,
  getCatById,
  getCatsByOwner,
  getCatByName,
  updateCatById,
  setActiveBackupProtocol,
  addGuardian,
  getGuardiansByOwner,
  updateGuardianByObjectId,
  createEmergencyEvent,
  getEmergencyEventById,
  assignGuardianToEvent,
  Authenticate,
  createSession,
  touchSession,
  deleteSession,
  getSessionBySessionId,
  updateUserPassword,
  updateUserProfile,
  createPasswordResetToken,
  getPasswordResetToken,
  deletePasswordResetToken,
  deleteUserAccount,
  searchUsersByName,
  createOwnerUnavailability,
  getActiveUnavailability,
  resolveUnavailability,
  createGuardianAccessToken,
  getGuardianAccessToken,
  acknowledgeGuardianToken,
  getGuardian,
  deleteCatById,
  deleteGuardianById,
};
