import { buildApp, T } from '../test-helpers';
import { CrStatus, CrAction } from './cr.enums';
import { BusinessError } from './errors';

describe('CrService approve / apply', () => {
	it('approves a pending CR, records approval + audit, and is idempotent once APPROVED', () => {
		const { service, users } = buildApp();
		const approved = service.approve(users.mona, 'CR-2', T);

		expect(approved.status).toBe(CrStatus.APPROVED);
		expect(approved.approvals).toEqual([{ userId: 'mona', action: CrAction.APPROVE, at: T }]);
		expect(approved.audit.some((e) => e.action === CrAction.APPROVE && e.byUserId === 'mona')).toBe(true);

		const again = service.approve(users.mona, 'CR-2', T);
		expect(again.status).toBe(CrStatus.APPROVED);
		expect(again.approvals).toHaveLength(1);
	});

	it('forbids approve without an approve policy', () => {
		const { service, users } = buildApp();
		expect(() => service.approve(users.viewer, 'CR-2', T)).toThrow(BusinessError);
		expect(() => service.approve(users.alice, 'CR-2', T)).toThrow(/Cannot approve/);
		expect(service.get(users.mona, 'CR-2').status).toBe(CrStatus.PENDING_APPROVAL);
	});

	it('rejects approve on an illegal status (DRAFT)', () => {
		const { service, users } = buildApp();
		expect(() => service.approve(users.mona, 'CR-1', T)).toThrow(/not allowed/i);
	});

	it('applies an approved CR, consumes budget for a positive delta, and audits', () => {
		const { service, budgets, users } = buildApp();
		service.approve(users.mona, 'CR-2', T);
		const before = budgets.get('BUD-1');
		if (!before) throw new Error('expected BUD-1');
		const snapshot = { booked: before.booked, balance: before.balance, spent: before.spent };

		const applied = service.apply(users.mona, 'CR-2', T);

		expect(applied.status).toBe(CrStatus.APPLIED);
		expect(applied.totals.delta).toBe(500);
		expect(applied.audit.some((e) => e.action === CrAction.APPLY)).toBe(true);

		const after = budgets.get('BUD-1');
		if (!after) throw new Error('expected BUD-1');
		expect(after.booked).toBe(snapshot.booked + 500);
		expect(after.balance).toBe(snapshot.balance - 500);
		expect(after.spent).toBe(snapshot.spent);
	});

	it('does not apply when the budget cannot cover a positive delta, and leaves the CR APPROVED', () => {
		const { service, budgets, users } = buildApp();
		service.approve(users.mona, 'CR-2', T);
		const budget = budgets.get('BUD-1');
		if (!budget) throw new Error('expected BUD-1');
		budget.balance = 0;
		const booked = budget.booked;

		let caught: unknown;
		try {
			service.apply(users.mona, 'CR-2', T);
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(BusinessError);
		expect((caught as BusinessError).code).toBe('INSUFFICIENT_BUDGET');

		expect(service.get(users.mona, 'CR-2').status).toBe(CrStatus.APPROVED);
		expect(budget.booked).toBe(booked);
		expect(budget.balance).toBe(0);
	});

	it('forbids apply without an apply policy and from a non-APPROVED status', () => {
		const { service, users } = buildApp();
		expect(() => service.apply(users.alice, 'CR-2', T)).toThrow(/Cannot apply/);
		expect(() => service.apply(users.mona, 'CR-2', T)).toThrow(/not allowed|terminal/i);
	});

	it('cannot apply (or otherwise mutate) a terminal CR', () => {
		const { service, users } = buildApp();
		expect(() => service.apply(users.mona, 'CR-APPLIED', T)).toThrow();
		expect(() => service.approve(users.mona, 'CR-APPLIED', T)).toThrow();
		expect(() => service.reject(users.mona, 'CR-APPLIED', T, 'too late')).toThrow();
	});
});
