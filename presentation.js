import {
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
  editCat,
  editGuardian,
  addNewGuardian,
  toggleCatBackupProtocol,
  requestPasswordReset,
  resetPasswordWithToken,
  updateProfile,
  updateUserPhoto,
  getCatByNameBusinessLayer,
  setOwnerUnavailable,
  setOwnerAvailable,
  getGuardianAccess,
  acknowledgeGuardianAccess,
  changePassword,
  deleteAccount,
  getGuardianForOwnerBusinessLayer,
  deleteCat,
  deleteGuardian,
} from "./business.js";
import { engine } from "express-handlebars";

async function getCatByNamePresentationLayer(catName, ownerId) {
  return getCatByNameBusinessLayer(catName, ownerId);
}

async function authenticateUser(email, password) {
  return await login(email, password);
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
  authenticateUser,
  registerUser,
  handleScan,
  getEmergencyView,
  claimGuardian,
  checkSessionMiddleware,
  logoutUser,
  getUserHomepage,
  addNewCat,
  editCat,
  editGuardian,
  addNewGuardian,
  toggleCatBackupProtocol,
  requestPasswordReset,
  resetPasswordWithToken,
  updateProfile,
  updateUserPhoto,
  getCatByNamePresentationLayer,
  setOwnerUnavailable,
  setOwnerAvailable,
  getGuardianAccess,
  acknowledgeGuardianAccess,
  changePassword,
  deleteAccount,
  getGuardianForOwnerPresentation,
  deleteCat,
  deleteGuardian,
};
