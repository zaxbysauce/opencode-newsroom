const DEBUG = process.env.OPENCODE_NEWSROOM_DEBUG === '1';

export function log(message: string, data?: unknown): void {
	if (!DEBUG) return;

	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.log(`[opencode-newsroom ${timestamp}] ${message}`, data);
	} else {
		console.log(`[opencode-newsroom ${timestamp}] ${message}`);
	}
}

export function warn(message: string, data?: unknown): void {
	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.warn(`[opencode-newsroom ${timestamp}] WARN: ${message}`, data);
	} else {
		console.warn(`[opencode-newsroom ${timestamp}] WARN: ${message}`);
	}
}

export function error(message: string, data?: unknown): void {
	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.error(`[opencode-newsroom ${timestamp}] ERROR: ${message}`, data);
	} else {
		console.error(`[opencode-newsroom ${timestamp}] ERROR: ${message}`);
	}
}
