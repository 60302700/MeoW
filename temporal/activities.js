import 'dotenv/config';
import { connectDB } from '../persistance.js';
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { sendGuardianMagicLinkEmail } from '../mailer.js';

async function getDB() {
    return await connectDB();
}

export async function checkEventClaimed(eventId) {
    const db = await getDB();
    const event = await db.collection('EmergencyEvents').findOne({ _id: new ObjectId(eventId) });
    return !event || event.status !== 'ALERTED';
}

export async function escalateToNextGuardian(eventId, priority) {
    const db = await getDB();
    const event = await db.collection('EmergencyEvents').findOne({ _id: new ObjectId(eventId) });
    if (!event || event.status !== 'ALERTED') return;

    const cat = await db.collection('Cats').findOne({ _id: event.catId });
    if (!cat) return;

    const guardian = await db.collection('Guardians').findOne({
        ownerId: cat.ownerId,
        priorityOrder: priority,
    });

    // Log the escalation into the event so the scan page can show it
    await db.collection('EmergencyEvents').updateOne(
        { _id: new ObjectId(eventId) },
        {
            $push: {
                escalationLog: {
                    priority,
                    guardianName: guardian ? guardian.name : 'Unknown',
                    escalatedAt: new Date(),
                },
            },
            $set: { currentEscalationPriority: priority },
        }
    );

    console.log(`[Temporal] Escalated event ${eventId} to guardian priority #${priority}: ${guardian?.name}`);
}

export async function sendGuardianMagicLink(unavailabilityId, ownerId, guardian, ownerName, catNames) {
    const db = await getDB();
    const token = uuidv4();
    await db.collection('GuardianAccessTokens').insertOne({
        token,
        unavailabilityId: new ObjectId(unavailabilityId),
        guardianId: new ObjectId(guardian.id),
        ownerId: new ObjectId(ownerId),
        acknowledged: false,
        createdAt: new Date(),
    });
    const owner = await db.collection('Users').findOne({ _id: new ObjectId(ownerId) });
    const ownerLocation = owner?.location || '';
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const magicLink = `${baseUrl}/guardian-access?token=${token}`;
    await sendGuardianMagicLinkEmail(guardian.email, guardian.name, ownerName, catNames, magicLink, ownerLocation);
    console.log(`[Temporal] Sent guardian magic link to ${guardian.email} for unavailability ${unavailabilityId}`);
}

export async function checkUnavailabilityAcknowledged(unavailabilityId) {
    const db = await getDB();
    const acked = await db.collection('GuardianAccessTokens').findOne({
        unavailabilityId: new ObjectId(unavailabilityId),
        acknowledged: true,
    });
    return !!acked;
}