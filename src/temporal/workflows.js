import { sleep, proxyActivities, setHandler, defineSignal, condition } from '@temporalio/workflow';

const {
    checkEventClaimed,
    escalateToNextGuardian,
    sendGuardianMagicLink,
    checkUnavailabilityAcknowledged,
    notifyGuardianOfFoundCat,
    checkOwnerAcknowledgedEmergency,
} = proxyActivities({
    startToCloseTimeout: '1 minute',
    retry: { maximumAttempts: 3 },
});

const ownerAvailableSignal       = defineSignal('ownerAvailable');
const guardianAckedSignal        = defineSignal('guardianAcknowledged');
const guardianDeclinedSignal     = defineSignal('guardianDeclined');
const ownerAcknowledgedScanSignal = defineSignal('ownerAcknowledgedScan');

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

// Runs when a QR code is scanned and a finder submits their info.
// Waits 10 minutes for the owner to acknowledge via email link.
// If no response, notifies each guardian in priority order with 10-minute windows.
export async function foundCatWorkflow({ eventId, totalGuardians }) {
    let ownerAcked = false;
    setHandler(ownerAcknowledgedScanSignal, () => { ownerAcked = true; });

    await condition(() => ownerAcked, '10 minutes');
    if (ownerAcked) return;

    for (let priority = 1; priority <= totalGuardians; priority++) {
        const claimed = await checkEventClaimed(eventId);
        if (claimed) return;

        await notifyGuardianOfFoundCat(eventId, priority);
        await sleep('10 minutes');

        const claimedAfter = await checkEventClaimed(eventId);
        if (claimedAfter) return;
    }
}

// Runs when owner marks themselves unavailable.
// Emails each guardian in priority order, waits 30 min for acknowledgment before escalating.
// Immediately escalates to the next guardian if the current one declines.
export async function ownerUnavailableWorkflow({ unavailabilityId, ownerId, ownerName, guardians, catNames }) {
    let done = false;
    let advanceToNext = false;

    setHandler(ownerAvailableSignal,   () => { done = true; });
    setHandler(guardianAckedSignal,    () => { done = true; });
    setHandler(guardianDeclinedSignal, () => { advanceToNext = true; });

    for (const guardian of guardians) {
        if (done) break;
        advanceToNext = false;
        await sendGuardianMagicLink(unavailabilityId, ownerId, guardian, ownerName, catNames);

        // Wait up to 30 minutes; exits early on acceptance, owner return, or decline
        await condition(() => done || advanceToNext, '30 minutes');
        if (done) break;
        if (advanceToNext) continue; // Guardian declined — move to next immediately

        const acked = await checkUnavailabilityAcknowledged(unavailabilityId);
        if (acked) break;
    }
}