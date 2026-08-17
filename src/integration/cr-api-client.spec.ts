import { CrApiClient } from './cr-api-client';
import { users } from '../backend/seed';
import { CrStatus } from '../backend/cr.enums';
import { T } from '../test-helpers';

describe('CrApiClient seam', () => {
	it('approves a pending CR through the client and returns the updated CR', async () => {
		const client = new CrApiClient();
		const updated = await client.approve(users.mona, 'CR-2', T);
		expect(updated.status).toBe(CrStatus.APPROVED);
		expect(updated.approvals.some((a) => a.userId === 'mona')).toBe(true);
	});

	it('translates a backend forbidden error into a UI-friendly message', async () => {
		const client = new CrApiClient();
		await expect(client.approve(users.viewer, 'CR-2', T)).rejects.toThrow(/permission/i);
		await expect(client.approve(users.viewer, 'CR-2', T)).rejects.not.toHaveProperty('code');
	});

	it('surfaces failNext as a network error without changing the CR', async () => {
		const client = new CrApiClient();
		client.failNext = true;
		await expect(client.approve(users.mona, 'CR-2', T)).rejects.toThrow(/network error/i);
		const stillPending = await client.get(users.mona, 'CR-2');
		expect(stillPending.status).toBe(CrStatus.PENDING_APPROVAL);
	});
});
