import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrApiClient } from '../../integration/cr-api-client';
import { SessionService } from '../../session/session.service';
import { ChangeRequest, ReqUser, TimelineEntry } from '../../backend/cr.types';
import { CrStatus } from '../../backend/cr.enums';
import { canApprovePolicy, canRejectPolicy } from '../permissions';
import { idle, loading, ViewState } from '../view-state';

/**
 * Change Request DETAIL page: loads a CR via the API client and renders its status, totals, timeline,
 * and permission-aware Approve/Reject actions. `load` and the template skeleton are provided; the
 * permission gating and the approve/reject actions are yours.
 */
@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnInit {
	@Input() id!: string;

	state: ViewState<ChangeRequest> = idle();
	submitting = false;
	actionError?: string;
	rejectReason = '';

	constructor(private readonly client: CrApiClient, private readonly session: SessionService) {}

	ngOnInit(): void {
		void this.load();
	}

	async load(): Promise<void> {
		this.state = loading();
		this.actionError = undefined;
		try {
			const detail = await this.client.get(this.session.user, this.id);
			this.state = { status: 'loaded', data: detail };
		} catch (err) {
			this.state = { status: 'error', data: null, error: (err as Error).message };
		}
	}

	get detail(): ChangeRequest | null {
		return this.state.data;
	}

	/** Approval history for display (read-only). */
	get timeline(): TimelineEntry[] {
		return this.detail?.audit ?? [];
	}

	onReasonInput(value: string): void {
		this.rejectReason = value;
	}

	/** Whether the current user may approve the loaded CR (status and policy). */
	get canApprove(): boolean {
		return this.detail?.status === CrStatus.PENDING_APPROVAL && canApprovePolicy(this.session.user);
	}

	get canReject(): boolean {
		return this.detail?.status === CrStatus.PENDING_APPROVAL && canRejectPolicy(this.session.user);
	}

	async approve(): Promise<void> {
		if (!this.canApprove || this.submitting) return;
		await this.runAction((user, id, at) => this.client.approve(user, id, at));
	}

	async reject(): Promise<void> {
		if (!this.canReject || this.submitting) return;
		const reason = this.rejectReason.trim();
		if (!reason) {
			this.actionError = 'A reason is required to reject.';
			return;
		}
		await this.runAction((user, id, at) => this.client.reject(user, id, at, reason));
	}

	private async runAction(action: (user: ReqUser, id: string, at: string) => Promise<ChangeRequest>): Promise<void> {
		this.submitting = true;
		this.actionError = undefined;
		try {
			const updated = await action(this.session.user, this.id, new Date().toISOString());
			this.state = { status: 'loaded', data: updated };
		} catch (err) {
			this.actionError = (err as Error).message;
		} finally {
			this.submitting = false;
		}
	}
}
