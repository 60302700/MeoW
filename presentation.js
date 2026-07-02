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
    toggleCatBackupProtocol
} from "./business.js";
import { engine } from "express-handlebars";

async function authenticateUser(email, password) {
    return await login(email, password);
}

async function checkSessionMiddleware(sessionId) {
    return await checkSession(sessionId);
}

async function logoutUser(sessionId) {
    return await logout(sessionId);
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
    toggleCatBackupProtocol
};
