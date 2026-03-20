/**
 * Knowledge entry identity and ID validation.
 *
 * Knowledge entries use simple alphanumeric IDs with optional dashes/underscores.
 * Max 64 characters to keep filenames sane.
 */

const KNOWLEDGE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Validates a knowledge entry ID.
 * Must be 1-64 characters, alphanumeric + dash/underscore, no path separators.
 */
export function validateKnowledgeId(id: string): string {
	if (!id || id.length === 0) {
		throw new Error('Invalid knowledge ID: empty string');
	}
	if (/[\0]/.test(id)) {
		throw new Error('Invalid knowledge ID: contains null bytes');
	}
	for (let i = 0; i < id.length; i++) {
		if (id.charCodeAt(i) < 32) {
			throw new Error('Invalid knowledge ID: contains control characters');
		}
	}
	if (id.includes('..') || id.includes('/') || id.includes('\\')) {
		throw new Error('Invalid knowledge ID: path traversal detected');
	}
	if (!KNOWLEDGE_ID_REGEX.test(id)) {
		throw new Error(
			`Invalid knowledge ID: must be 1-64 alphanumeric chars (plus - and _), got "${id}"`,
		);
	}
	return id;
}

/**
 * Generates a timestamp-based knowledge ID.
 */
export function generateKnowledgeId(): string {
	const now = Date.now();
	const suffix = Math.random().toString(36).slice(2, 6);
	return `K${now}-${suffix}`;
}
