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