import { sleep, proxyActivities, setHandler, defineSignal, condition } from '@temporalio/workflow';

const { checkEventClaimed, escalateToNextGuardian, sendGuardianMagicLink, checkUnavailabilityAcknowledged } = proxyActivities({
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

// Runs when owner marks themselves unavailable.
// Emails each guardian in priority order, waits 30 min for acknowledgment before escalating.
export async function ownerUnavailableWorkflow({ unavailabilityId, ownerId, ownerName, guardians, catNames }) {
    let done = false;
    setHandler(defineSignal('ownerAvailable'), () => { done = true; });
    setHandler(defineSignal('guardianAcknowledged'), () => { done = true; });

    for (const guardian of guardians) {
        if (done) break;
        await sendGuardianMagicLink(unavailabilityId, ownerId, guardian, ownerName, catNames);

        // Wait up to 30 minutes; exits early if owner comes back or guardian acks
        await condition(() => done, '30 minutes');
        if (done) break;

        const acked = await checkUnavailabilityAcknowledged(unavailabilityId);
        if (acked) break;
    }
}