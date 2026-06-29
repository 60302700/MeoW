import { logout, login, registerUser, handleScan, getEmergencyView, claimGuardian, checkSession } from "./business.js";
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

export { engine, authenticateUser, registerUser, handleScan, getEmergencyView, claimGuardian, checkSessionMiddleware, logoutUser };
