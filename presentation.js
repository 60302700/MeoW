import {
  connectDB,
  registerUser,
  authenticateUser,
  checkSession,
  logout,
  requestPasswordReset,
  handleScan,
  getEmergencyView,
  claimGuardian,
  getUserHomepage,
  addNewCat,
  editCat,
  editGuardian,
  addNewGuardian,
  toggleCatBackupProtocol,
  updateProfile,
  updateUserPhoto,
  getCatByNameBusinessLayer,
  setOwnerUnavailable,
  setOwnerAvailable,
  getGuardianAccess,
  acknowledgeGuardianAccess,
  deleteAccount,
  getGuardianForOwnerBusinessLayer,
  deleteCat,
  deleteGuardian,
} from "./business.js";
import { engine } from "express-handlebars";

async function getCatByNamePresentationLayer(catName, ownerId) {
  return getCatByNameBusinessLayer(catName, ownerId);
}

async function checkSessionMiddleware(sessionId) {
  return await checkSession(sessionId);
}

async function logoutUser(sessionId) {
  return await logout(sessionId);
}

async function getGuardianForOwnerPresentation(OId, guardianId) {
  return await getGuardianForOwnerBusinessLayer(OId, guardianId);
}

export {
  connectDB,
  engine,
  registerUser,
  authenticateUser,
  checkSessionMiddleware,
  logoutUser,
  requestPasswordReset,
  handleScan,
  getEmergencyView,
  claimGuardian,
  getUserHomepage,
  addNewCat,
  editCat,
  editGuardian,
  addNewGuardian,
  toggleCatBackupProtocol,
  updateProfile,
  updateUserPhoto,
  getCatByNamePresentationLayer,
  setOwnerUnavailable,
  setOwnerAvailable,
  getGuardianAccess,
  acknowledgeGuardianAccess,
  deleteAccount,
  getGuardianForOwnerPresentation,
  deleteCat,
  deleteGuardian,
};
