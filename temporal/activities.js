import 'dotenv/config';
import { connectDB, getEmergencyEventById, getCatById, getGuardiansByOwner } from '../persistance.js';
import { MongoClient, ObjectId } from 'mongodb';

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