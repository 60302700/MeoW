import {
  connectDB,
  Authenticate,
  createUser,
  findUserByEmail,
  findUserById,
  deleteUserAccount,
  getCatByQrCode,
  getCatById,
  getCatsByOwner,
  getCatByName,
  createEmergencyEvent,
  getEmergencyEventById,
  getGuardiansByOwner,
  assignGuardianToEvent,
  createSession,
  deleteSession,
  getSessionBySessionId,
  createCat,
  addGuardian,
  updateCatById,
  updateGuardianByObjectId,
  setActiveBackupProtocol,
  updateUserPassword,
  updateUserProfile,
  touchSession,
  createPasswordResetToken,
  getPasswordResetToken,
  deletePasswordResetToken,
  searchUsersByName,
  createOwnerUnavailability,
  getActiveUnavailability,
  resolveUnavailability,
  getGuardianAccessToken,
  acknowledgeGuardianToken,
  getGuardian,
  deleteCatById,
  deleteGuardianById,
} from "./persistance.js";
import { sendPasswordResetEmail, sendWalletCardEmail } from "./mailer.js";
import {
  startOwnerUnavailableWorkflow,
  signalOwnerAvailable,
  signalGuardianAcknowledged,
} from "./temporal/client.js";
import bcrypt from "bcryptjs";
import { ReturnDocument } from "mongodb";

function validatePassword(password) {
  if (!password || password.length < 8)
    throw new Error("Password must be at least 8 characters.");
  if (!/[A-Z]/.test(password))
    throw new Error("Password must contain at least one uppercase letter.");
  if (!/[a-z]/.test(password))
    throw new Error("Password must contain at least one lowercase letter.");
  if (!/[0-9]/.test(password))
    throw new Error("Password must contain at least one number.");
  if (!/[^A-Za-z0-9]/.test(password))
    throw new Error("Password must contain at least one special character.");
}

async function getCatByNameBusinessLayer(catName, ownerId) {
  return getCatByName(catName, ownerId);
}

async function searchGurdian(name) {
  return await searchUsersByName(name);
}

async function login(email, password) {
  const result = await Authenticate(email, password);
  if (result) {
    return await createSession(email);
  } else {
    return null;
  }
}

async function registerUser({ name, email, password, phone }) {
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new Error("Email already registered");
  }
  validatePassword(password);
  const passwordHash = await bcrypt.hash(password, 10);
  return createUser({ name, email, passwordHash, phone });
}

async function handleScan(qrCodeId) {
  const cat = await getCatByQrCode(qrCodeId);
  if (!cat) {
    throw new Error("Invalid Emergency ID. Please try again.");
  }
  const eventId = await createEmergencyEvent({ qrCodeId, catId: cat._id });
  const guardians = await getGuardiansByOwner(cat.ownerId);
  return { cat, eventId, guardianCount: guardians.length };
}

async function getEmergencyView(eventId) {
  const event = await getEmergencyEventById(eventId);
  if (!event) {
    throw new Error("Emergency event not found.");
  }
  const cat = await getCatById(event.catId);
  const guardians = await getGuardiansByOwner(cat.ownerId);
  return { event, cat, guardians };
}

async function claimGuardian(eventId, guardianId) {
  return assignGuardianToEvent(eventId, guardianId);
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

async function getUserHomepage(sessionId) {
  const session = await getSessionBySessionId(sessionId);
  if (!session) return null;
  const user = await findUserByEmail(session.email);
  if (!user) return null;
  const cats = await getCatsByOwner(user._id);
  const guardians = await getGuardiansByOwner(user._id);
  const unavailability = await getActiveUnavailability(user._id.toString());
  return { user, cats, guardians, isUnavailable: !!unavailability };
}

async function getGuardianForOwnerBusinessLayer(sessionId, guardianId) {
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");

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
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");

  return await createCat({
    ownerId: user._id,
    name,
    breed,
    age: parseInt(age, 10) || 0,
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
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");

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
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");

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
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");
  const cat = await getCatById(catId);
  if (!cat || cat.ownerId.toString() !== user._id.toString())
    throw new Error("Cat not found");

  const updates = {
    name,
    breed: breed || "",
    age: parseInt(age, 10) || 0,
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
  };
  if (photoUrl) updates.photoUrl = photoUrl;

  await updateCatById(catId, updates);
}

async function toggleCatBackupProtocol(sessionId, catId) {
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");
  const cat = await getCatById(catId);
  if (!cat || cat.ownerId.toString() !== user._id.toString())
    throw new Error("Cat not found");

  const newStatus = !cat.isActiveBackupProtocol;
  await setActiveBackupProtocol(catId, newStatus);
  return newStatus;
}

async function updateUserPhoto(sessionId, photoUrl) {
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");
  await updateUserProfile(user._id, { photoUrl });
}

async function requestPasswordReset(email) {
  const user = await findUserByEmail(email);
  if (!user) throw new Error("No account found with that email.");
  const token = await createPasswordResetToken(email);
  await sendPasswordResetEmail(email, token);
}

async function resetPasswordWithToken(token, newPassword) {
  const record = await getPasswordResetToken(token);
  if (!record) throw new Error("This reset link is invalid or has expired.");
  validatePassword(newPassword);
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await updateUserPassword(record.email, passwordHash);
  await deletePasswordResetToken(token);
}

async function updateProfile(
  sessionId,
  { name, phone, currentPassword, newPassword },
) {
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");

  if (newPassword) {
    const valid = await bcrypt.compare(
      currentPassword || "",
      user.passwordHash,
    );
    if (!valid) throw new Error("Current password is incorrect.");
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(session.email, passwordHash);
  }

  const updates = {};
  if (name && name.trim()) updates.name = name.trim();
  if (phone !== undefined) updates.phone = phone.trim();
  if (Object.keys(updates).length > 0) {
    await updateUserProfile(user._id, updates);
  }
}

async function changePassword(sessionId, currentPassword, newPassword) {
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect.");
  validatePassword(newPassword);
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await updateUserPassword(session.email, passwordHash);
}

async function deleteCat(sessionId, catId) {
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");
  const cat = await getCatById(catId);
  if (!cat || cat.ownerId.toString() !== user._id.toString())
    throw new Error("Cat not found");
  await deleteCatById(catId, user._id.toString());
}

async function deleteGuardian(sessionId, guardianId) {
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");
  const guardian = await getGuardian(user._id.toString(), guardianId);
  if (!guardian) throw new Error("Guardian not found or unauthorized");
  await deleteGuardianById(guardianId, user._id.toString());
}

async function deleteAccount(sessionId, password) {
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Incorrect password.");
  await deleteUserAccount(user._id.toString(), user.email);
}

async function setOwnerUnavailable(sessionId) {
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");

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
  const session = await getSessionBySessionId(sessionId);
  if (!session) throw new Error("Unauthorized");
  const user = await findUserByEmail(session.email);
  if (!user) throw new Error("User not found");

  const record = await getActiveUnavailability(user._id.toString());
  if (!record) return;

  await resolveUnavailability(record._id.toString());
  await signalOwnerAvailable(record._id.toString());
}

async function getGuardianAccess(token) {
  const record = await getGuardianAccessToken(token);
  if (!record) throw new Error("This link is invalid or has expired.");
  const cats = await getCatsByOwner(record.ownerId.toString());
  const owner = await findUserById(record.ownerId.toString());
  return {
    record,
    cats,
    ownerName: owner?.name || "Unknown",
    alreadyAcknowledged: record.acknowledged,
  };
}

async function acknowledgeGuardianAccess(token) {
  const record = await getGuardianAccessToken(token);
  if (!record) throw new Error("This link is invalid or has expired.");
  if (record.acknowledged) return;
  await acknowledgeGuardianToken(token);
  await signalGuardianAcknowledged(record.unavailabilityId.toString());

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
      cats,
      magicLink,
    );
  }
}


export {
  connectDB,
  logout,
  login,
  registerUser,
  handleScan,
  getEmergencyView,
  claimGuardian,
  checkSession,
  getUserHomepage,
  addNewCat,
  addNewGuardian,
  editCat,
  editGuardian,
  toggleCatBackupProtocol,
  requestPasswordReset,
  resetPasswordWithToken,
  updateProfile,
  updateUserPhoto,
  getCatByNameBusinessLayer,
  searchGurdian,
  setOwnerUnavailable,
  setOwnerAvailable,
  getGuardianAccess,
  acknowledgeGuardianAccess,
  changePassword,
  deleteAccount,
  getGuardianForOwnerBusinessLayer,
  deleteCat,
  deleteGuardian,
};
