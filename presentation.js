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
  GuardianSearch,
  updateGuardianById,
  getCatByNameBusinessLayer,
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

async function updateGuardianPresentation(sessionId, Id, updates) {
  return await updateGuardianById(sessionId, Id, updates);
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
  searchGuardianByName,
  updateGuardianPresentation,
};
