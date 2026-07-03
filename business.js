import {
    connectDB,
    Authenticate,
    createUser,
    findUserByEmail,
    getCatByQrCode,
    getCatById,
    getCatsByOwner,
    createEmergencyEvent,
    getEmergencyEventById,
    getGuardiansByOwner,
    assignGuardianToEvent,
    createSession,
    deleteSession,
    getSessionBySessionId,
    createCat,
    addGuardian,
    setActiveBackupProtocol,
    updateUserPassword,
    updateUserProfile
} from "./persistance.js";
import bcrypt from "bcryptjs";

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
    const passwordHash = await bcrypt.hash(password, 10);
    return createUser({ name, email, passwordHash, phone });
}

async function handleScan(qrCodeId) {
    const cat = await getCatByQrCode(qrCodeId);
    if (!cat) {
        throw new Error("Invalid Emergency ID. Please try again.");
    }
    const eventId = await createEmergencyEvent({ qrCodeId, catId: cat._id });
    return { cat, eventId };
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
    if (!session) {
        return false;
    }
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
    return { user, cats, guardians };
}

async function addNewCat(sessionId, { name, breed, age, photoUrl, care, qrCodeId }) {
    const session = await getSessionBySessionId(sessionId);
    if (!session) throw new Error("Unauthorized");
    const user = await findUserByEmail(session.email);
    if (!user) throw new Error("User not found");

    const careInstructions = {
        diet: care || "Standard diet",
        medical: "No known conditions",
        vetDetails: "No vet specified"
    };

    if (care) {
        const lines = care.split('\n');
        let currentSection = 'diet';
        let sections = { diet: [], medical: [], vetDetails: [] };
        for (let line of lines) {
            const cleaned = line.trim();
            if (!cleaned) continue;
            if (cleaned.toLowerCase().includes('diet:')) {
                currentSection = 'diet';
            } else if (cleaned.toLowerCase().includes('medical:')) {
                currentSection = 'medical';
            } else if (cleaned.toLowerCase().includes('vet:')) {
                currentSection = 'vetDetails';
            } else {
                sections[currentSection].push(cleaned);
            }
        }
        careInstructions.diet = sections.diet.join('\n') || "Standard diet";
        careInstructions.medical = sections.medical.join('\n') || "No known conditions";
        careInstructions.vetDetails = sections.vetDetails.join('\n') || "No vet specified";
    }

    return await createCat({
        ownerId: user._id,
        name,
        breed,
        age: parseInt(age, 10) || 0,
        photoUrl: photoUrl || "",
        careInstructions,
        qrCodeId
    });
}

async function addNewGuardian(sessionId, { name, email, phone, priorityOrder }) {
    const session = await getSessionBySessionId(sessionId);
    if (!session) throw new Error("Unauthorized");
    const user = await findUserByEmail(session.email);
    if (!user) throw new Error("User not found");

    return await addGuardian({
        ownerId: user._id,
        name,
        phone,
        email,
        priorityOrder: parseInt(priorityOrder, 10) || 1
    });
}

async function toggleCatBackupProtocol(sessionId, catId) {
    const session = await getSessionBySessionId(sessionId);
    if (!session) throw new Error("Unauthorized");
    const cat = await getCatById(catId);
    if (!cat) throw new Error("Cat not found");

    const newStatus = !cat.isActiveBackupProtocol;
    await setActiveBackupProtocol(catId, newStatus);
    return newStatus;
}

async function resetPassword(email, newPassword) {
    const user = await findUserByEmail(email);
    if (!user) throw new Error("No account found with that email.");
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(email, passwordHash);
}

async function updateProfile(sessionId, { name, phone, currentPassword, newPassword }) {
    const session = await getSessionBySessionId(sessionId);
    if (!session) throw new Error("Unauthorized");
    const user = await findUserByEmail(session.email);
    if (!user) throw new Error("User not found");

    if (newPassword) {
        const valid = await bcrypt.compare(currentPassword || '', user.passwordHash);
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
    toggleCatBackupProtocol,
    resetPassword,
    updateProfile
};
