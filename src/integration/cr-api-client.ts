import { Injectable } from '@angular/core';
import { ChangeRequest, ReqUser } from '../backend/cr.types';
import { CrService } from '../backend/cr-service';
import { CrRepo } from '../backend/cr-repo';
import { buildSeed } from '../backend/seed';
import { BusinessError } from '../backend/errors';

/**
 * The API/UI boundary. The Angular UI talks to this async client; the client calls the in-process
 * backend `CrService` (built over the seeded repo). This stands in for an HTTP layer — same contract,
 * no network. Business errors thrown by the service surface as rejected promises (the UI shows them).
 *
 * `latencyMs`/`failNext` let the UI exercise loading and error handling.
 */
@Injectable({ providedIn: 'root' })
export class CrApiClient {
	latencyMs = 0;
	failNext = false;
	private readonly service: CrService;

	constructor() {
		const seed = buildSeed();
		const repo = new CrRepo();
		repo.seed(seed.changeRequests);
		this.service = new CrService(repo, seed.agreements, seed.budgets);
	}

	private settle<T>(produce: () => T): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			setTimeout(() => {
				if (this.failNext) {
					this.failNext = false;
					reject(new Error('Network error'));
					return;
				}
				try {
					resolve(produce());
				} catch (err) {
					reject(this.toClientError(err));
				}
			}, this.latencyMs);
		});
	}

	/** Map backend/business errors to a plain Error the template can render. */
	private toClientError(err: unknown): Error {
		if (err instanceof BusinessError) {
			return new Error(this.clientMessage(err));
		}
		if (err instanceof Error) return err;
		return new Error('Something went wrong');
	}

	private clientMessage(err: BusinessError): string {
		switch (err.code) {
			case 'FORBIDDEN':
				return "You don't have permission to perform this action.";
			case 'NOT_FOUND':
				return 'Change request not found.';
			case 'TERMINAL_STATE':
				return 'This change request can no longer be changed.';
			case 'INSUFFICIENT_BUDGET':
				return 'The budget cannot cover this change.';
			case 'ILLEGAL_TRANSITION':
			case 'VALIDATION':
				return err.message;
			default:
				return err.message;
		}
	}

	list(user: ReqUser): Promise<ChangeRequest[]> {
		return this.settle(() => this.service.list(user));
	}
	get(user: ReqUser, id: string): Promise<ChangeRequest> {
		return this.settle(() => this.service.get(user, id));
	}
	approve(user: ReqUser, id: string, at: string): Promise<ChangeRequest> {
		return this.settle(() => this.service.approve(user, id, at));
	}
	reject(user: ReqUser, id: string, at: string, note: string): Promise<ChangeRequest> {
		return this.settle(() => this.service.reject(user, id, at, note));
	}
}
