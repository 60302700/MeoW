import { login, registerUser, handleScan, getEmergencyView, claimGuardian, checkSession } from "./business.js";
import { engine } from "express-handlebars";

async function authenticateUser(email, password) {
    return await login(email, password);
}

async function checkSessionMiddleware(sessionId) {
    return await checkSession(sessionId);
}

export { engine, authenticateUser, registerUser, handleScan, getEmergencyView, claimGuardian, checkSessionMiddleware };
