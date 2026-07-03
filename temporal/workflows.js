import { sleep, proxyActivities } from '@temporalio/workflow';

const { checkEventClaimed, escalateToNextGuardian } = proxyActivities({
    startToCloseTimeout: '1 minute',
    retry: { maximumAttempts: 3 },
});

// Runs after an emergency event is created.
// Every 10 minutes it checks if any guardian has claimed the event.
// If not, it escalates to the next guardian in priority order.
export async function guardianEscalationWorkflow({ eventId, totalGuardians }) {
    for (let priority = 2; priority <= totalGuardians; priority++) {
        await sleep('10 minutes');
        const claimed = await checkEventClaimed(eventId);
        if (claimed) return;
        await escalateToNextGuardian(eventId, priority);
    }
    // Final wait after last guardian notified
    await sleep('10 minutes');
}