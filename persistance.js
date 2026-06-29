import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'Meow';

if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to your .env file.');
}

const client = new MongoClient(uri);
let db = null;

async function connectDB() {
    if (!db) {
        await client.connect();
        db = client.db(dbName);
        console.log('Connected to MongoDB');
    }
    return db;
}

async function closeDB() {
    await client.close();
    db = null;
}

function collections() {
    return {
        Users: db.collection('Users'),
        Cats: db.collection('Cats'),
        Guardians: db.collection('Guardians'),
        EmergencyEvents: db.collection('EmergencyEvents'),
        Sessions: db.collection('Sessions'),
    };
}

// ---- Users ----

async function createUser({ name, email, passwordHash, phone }) {
    const { Users } = collections();
    const result = await Users.insertOne({ name, email, passwordHash, phone, createdAt: new Date() });
    return result.insertedId;
}

async function findUserByEmail(email) {
    const { Users } = collections();
    return Users.findOne({ email });
}

async function findUserById(userId) {
    const { Users } = collections();
    return Users.findOne({ _id: new ObjectId(userId) });
}


async function Authenticate(email, password) {
    const { Users } = collections();
    const user = await Users.findOne({ email: email });
    console.log(user)
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return false;
    }
    return true;
}
// ---- Cats ----

async function createCat({ ownerId, name, breed, age, photoUrl, careInstructions, qrCodeId }) {
    const { Cats } = collections();
    const result = await Cats.insertOne({
        ownerId: new ObjectId(ownerId),
        name,
        breed,
        age,
        photoUrl,
        careInstructions,
        qrCodeId,
        isActiveBackupProtocol: false,
    });
    return result.insertedId;
}

async function getCatByQrCode(qrCodeId) {
    const { Cats } = collections();
    return Cats.findOne({ qrCodeId });
}

async function getCatById(catId) {
    const { Cats } = collections();
    return Cats.findOne({ _id: new ObjectId(catId) });
}

async function getCatsByOwner(ownerId) {
    const { Cats } = collections();
    return Cats.find({ ownerId: new ObjectId(ownerId) }).toArray();
}

async function setActiveBackupProtocol(catId, isActive) {
    const { Cats } = collections();
    await Cats.updateOne({ _id: new ObjectId(catId) }, { $set: { isActiveBackupProtocol: isActive } });
}

// ---- Guardians ----

async function addGuardian({ ownerId, name, phone, email, priorityOrder }) {
    const { Guardians } = collections();
    const result = await Guardians.insertOne({
        ownerId: new ObjectId(ownerId),
        name,
        phone,
        email,
        priorityOrder,
        hasAccepted: false,
    });
    return result.insertedId;
}

async function getGuardiansByOwner(ownerId) {
    const { Guardians } = collections();
    return Guardians.find({ ownerId: new ObjectId(ownerId) }).sort({ priorityOrder: 1 }).toArray();
}

async function setGuardianAccepted(guardianId, hasAccepted) {
    const { Guardians } = collections();
    await Guardians.updateOne({ _id: new ObjectId(guardianId) }, { $set: { hasAccepted } });
}

// ---- Emergency Events ----

async function createEmergencyEvent({ qrCodeId, catId, responderGeo }) {
    const { EmergencyEvents } = collections();
    const result = await EmergencyEvents.insertOne({
        qrCodeId,
        catId: new ObjectId(catId),
        triggeredAt: new Date(),
        responderGeo: responderGeo || null,
        status: 'ALERTED',
        assignedGuardianId: null,
    });
    return result.insertedId;
}

async function getEmergencyEventById(eventId) {
    const { EmergencyEvents } = collections();
    return EmergencyEvents.findOne({ _id: new ObjectId(eventId) });
}

async function getEmergencyEventsByCat(catId) {
    const { EmergencyEvents } = collections();
    return EmergencyEvents.find({ catId: new ObjectId(catId) }).sort({ triggeredAt: -1 }).toArray();
}

async function assignGuardianToEvent(eventId, guardianId) {
    const { EmergencyEvents } = collections();
    await EmergencyEvents.updateOne(
        { _id: new ObjectId(eventId) },
        { $set: { assignedGuardianId: new ObjectId(guardianId), status: 'GUARDIAN_RESPONDED' } }
    );
}

async function updateEmergencyEventStatus(eventId, status) {
    const { EmergencyEvents } = collections();
    await EmergencyEvents.updateOne({ _id: new ObjectId(eventId) }, { $set: { status } });
}

async function createSession(email) {
    const { Sessions } = collections();
    const sessionValue = uuidv4();
    const result = await Sessions.insertOne({ email: email, sessionId: sessionValue });
    return sessionValue;
}

async function getSession(email) {
    const { Sessions } = collections();
    return Sessions.findOne({ email: email });
}

async function getSessionBySessionId(sessionId) {
    const { Sessions } = collections();
    return Sessions.findOne({ sessionId: sessionId });
}

async function deleteSession(sessionId) {
    const { Sessions } = collections();
    await Sessions.deleteOne({ sessionId: sessionId });
}

export {
    connectDB,
    closeDB,
    createUser,
    findUserByEmail,
    findUserById,
    createCat,
    getCatByQrCode,
    getCatById,
    getCatsByOwner,
    setActiveBackupProtocol,
    addGuardian,
    getGuardiansByOwner,
    setGuardianAccepted,
    createEmergencyEvent,
    getEmergencyEventById,
    getEmergencyEventsByCat,
    assignGuardianToEvent,
    updateEmergencyEventStatus,
    Authenticate,
    createSession,
    getSession,
    deleteSession,
    getSessionBySessionId
};
