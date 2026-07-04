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
  addNewGuardian,
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
} from "./business.js";
import { engine } from "express-handlebars";

async function getCatByNamePresentationLayer(catName) {
  return getCatByNameBusinessLayer(catName);
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

async function searchGuardianByName(name) {
  return await GuardianSearch(name);
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
  addNewGuardian,
  toggleCatBackupProtocol,
  requestPasswordReset,
  resetPasswordWithToken,
  updateProfile,
  updateUserPhoto,
  getCatByNamePresentationLayer,
  searchUsersByName,
  setOwnerUnavailable,
  setOwnerAvailable,
  getGuardianAccess,
  acknowledgeGuardianAccess,
  changePassword,
  deleteAccount,
};
