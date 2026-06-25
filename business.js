import { Authenticate } from "./persistance.js";

export async function AuthenticateUser(email, password) {
    // Business logic could go here (e.g., password hashing check, logging, etc.)
    return await Authenticate(email, password);
}