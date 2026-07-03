import 'dotenv/config';
import { Worker, NativeConnection } from '@temporalio/worker';
import { fileURLToPath } from 'url';
import * as activities from './activities.js';

const address = process.env.TEMPORAL_ADDRESS;
const namespace = process.env.TEMPORAL_NAMESPACE;
const apiKey = process.env.TEMPORAL_API_KEY;

if (!address || !namespace || !apiKey) {
    throw new Error('Missing TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, or TEMPORAL_API_KEY in .env');
}

const connection = await NativeConnection.connect({
    address,
    tls: true,
    metadata: { 'temporal-namespace': namespace },
    apiKey,
});

const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: 'meow-escalation',
    workflowsPath: fileURLToPath(new URL('./workflows.js', import.meta.url)),
    activities,
});

console.log('[Temporal] Worker started — listening on task queue: meow-escalation');
await worker.run();