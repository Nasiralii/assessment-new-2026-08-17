import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrDetailComponent } from './cr-detail.component';
import { SessionService } from '../../session/session.service';
import { CrApiClient } from '../../integration/cr-api-client';
import { users } from '../../backend/seed';
import { ReqUser } from '../../backend/cr.types';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser, id: string): Promise<ComponentFixture<CrDetailComponent>> {
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrDetailComponent);
	fixture.componentInstance.id = id;
	fixture.detectChanges(); // ngOnInit -> load()
	await flush();
	fixture.detectChanges();
	return fixture;
}

function approveButton(fixture: ComponentFixture<CrDetailComponent>): HTMLButtonElement {
	return fixture.nativeElement.querySelector('.cr-actions__approve');
}

describe('CrDetailComponent', () => {
	it('loads and renders the change request title', async () => {
		const fixture = await render(users.mona, 'CR-2'); // CR-2 is PENDING_APPROVAL
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2')).not.toBeNull();
	});

	it('disables Approve for a read-only viewer on a pending CR', async () => {
		const fixture = await render(users.viewer, 'CR-2'); // viewer: cr_r_o only
		expect(approveButton(fixture).disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it('enables Approve for an approver on a pending CR', async () => {
		const fixture = await render(users.mona, 'CR-2');
		expect(approveButton(fixture).disabled).toBe(false);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).not.toBeNull();
	});

	it('disables Approve when the CR is not pending even if the user is an approver', async () => {
		const fixture = await render(users.mona, 'CR-1'); // DRAFT
		expect(approveButton(fixture).disabled).toBe(true);
	});

	it('approves through the API client and updates the rendered status', async () => {
		const fixture = await render(users.mona, 'CR-2');
		approveButton(fixture).click();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toContain('APPROVED');
		expect(approveButton(fixture).disabled).toBe(true);
	});

	it('keeps the loaded CR and shows an error when approve fails', async () => {
		const fixture = await render(users.mona, 'CR-2');
		const client = TestBed.inject(CrApiClient);
		client.failNext = true;
		approveButton(fixture).click();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toMatch(/network error/i);
		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toContain('PENDING_APPROVAL');
	});

	it('rejects through the client only when a reason is provided', async () => {
		const fixture = await render(users.mona, 'CR-2');
		const rejectBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__reject-btn');
		expect(rejectBtn.disabled).toBe(true);

		fixture.componentInstance.onReasonInput('  out of policy  ');
		fixture.detectChanges();
		expect(rejectBtn.disabled).toBe(false);

		rejectBtn.click();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toContain('REJECTED');
	});
});
