import { Client, Connection } from '@temporalio/client';

let temporalClient = null;

export async function getTemporalClient() {
    if (temporalClient) return temporalClient;

    const address = process.env.TEMPORAL_ADDRESS;
    const namespace = process.env.TEMPORAL_NAMESPACE;
    const apiKey = process.env.TEMPORAL_API_KEY;

    if (!address || !namespace || !apiKey) {
        console.warn('[Temporal] Missing env vars — escalation workflows disabled.');
        return null;
    }

    const connection = await Connection.connect({
        address,
        tls: true,
        metadata: { 'temporal-namespace': namespace },
        apiKey,
    });

    temporalClient = new Client({ connection, namespace });
    return temporalClient;
}

export async function startEscalationWorkflow(eventId, totalGuardians) {
    if (totalGuardians < 2) return; // nothing to escalate to
    const client = await getTemporalClient();
    if (!client) return;

    await client.workflow.start('guardianEscalationWorkflow', {
        taskQueue: 'meow-escalation',
        workflowId: `escalation-${eventId}`,
        args: [{ eventId: eventId.toString(), totalGuardians }],
    });

    console.log(`[Temporal] Started escalation workflow for event ${eventId}`);
}

export async function startFoundCatWorkflow(eventId, totalGuardians) {
    const client = await getTemporalClient();
    if (!client) return;
    await client.workflow.start('foundCatWorkflow', {
        taskQueue: 'meow-escalation',
        workflowId: `found-cat-${eventId}`,
        args: [{ eventId: eventId.toString(), totalGuardians }],
    });
    console.log(`[Temporal] Started found-cat workflow for event ${eventId}`);
}

export async function signalOwnerAcknowledgedScan(eventId) {
    const client = await getTemporalClient();
    if (!client) return;
    try {
        const handle = client.workflow.getHandle(`found-cat-${eventId}`);
        await handle.signal('ownerAcknowledgedScan');
    } catch (err) {
        console.warn('[Temporal] signalOwnerAcknowledgedScan — workflow may have already completed:', err.message);
    }
}

export async function startOwnerUnavailableWorkflow(unavailabilityId, ownerId, ownerName, guardians, catNames) {
    const client = await getTemporalClient();
    if (!client) return;
    await client.workflow.start('ownerUnavailableWorkflow', {
        taskQueue: 'meow-escalation',
        workflowId: `unavailable-${unavailabilityId}`,
        args: [{ unavailabilityId, ownerId, ownerName, guardians, catNames }],
    });
    console.log(`[Temporal] Started owner-unavailable workflow for unavailability ${unavailabilityId}`);
}

export async function signalOwnerAvailable(unavailabilityId) {
    const client = await getTemporalClient();
    if (!client) return;
    try {
        const handle = client.workflow.getHandle(`unavailable-${unavailabilityId}`);
        await handle.signal('ownerAvailable');
    } catch (err) {
        console.warn('[Temporal] signalOwnerAvailable — workflow may have already completed:', err.message);
    }
}

export async function signalGuardianAcknowledged(unavailabilityId) {
    const client = await getTemporalClient();
    if (!client) return;
    try {
        const handle = client.workflow.getHandle(`unavailable-${unavailabilityId}`);
        await handle.signal('guardianAcknowledged');
    } catch (err) {
        console.warn('[Temporal] signalGuardianAcknowledged — workflow may have already completed:', err.message);
    }
}

export async function signalGuardianDeclined(unavailabilityId) {
    const client = await getTemporalClient();
    if (!client) return;
    try {
        const handle = client.workflow.getHandle(`unavailable-${unavailabilityId}`);
        await handle.signal('guardianDeclined');
    } catch (err) {
        console.warn('[Temporal] signalGuardianDeclined — workflow may have already completed:', err.message);
    }
}