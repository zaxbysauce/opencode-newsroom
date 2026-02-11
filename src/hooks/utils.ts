import * as path from 'node:path';
import { NewsroomError, warn } from '../utils';

export function safeHook<I, O>(
	fn: (input: I, output: O) => Promise<void>,
): (input: I, output: O) => Promise<void> {
	return async (input: I, output: O) => {
		try {
			await fn(input, output);
		} catch (_error) {
			const functionName = fn.name || 'unknown';
			if (_error instanceof NewsroomError) {
				warn(
					`Hook '${functionName}' failed: ${_error.message}\n  → ${_error.guidance}`,
				);
			} else {
				warn(`Hook function '${functionName}' failed:`, _error);
			}
		}
	};
}

export function composeHandlers<I, O>(
	...fns: Array<(input: I, output: O) => Promise<void>>
): (input: I, output: O) => Promise<void> {
	if (fns.length === 0) {
		return async () => {};
	}

	return async (input: I, output: O) => {
		for (const fn of fns) {
			const safeFn = safeHook(fn);
			await safeFn(input, output);
		}
	};
}

export function validateNewsroomPath(directory: string, filename: string): string {
	if (/[\0]/.test(filename)) {
		throw new Error('Invalid filename: contains null bytes');
	}
	if (/\.\.[/\\]/.test(filename)) {
		throw new Error('Invalid filename: path traversal detected');
	}
	const baseDir = path.normalize(path.resolve(directory, '.newsroom'));
	const resolved = path.normalize(path.resolve(baseDir, filename));
	if (process.platform === 'win32') {
		if (!resolved.toLowerCase().startsWith((baseDir + path.sep).toLowerCase())) {
			throw new Error('Invalid filename: path escapes .newsroom directory');
		}
	} else {
		if (!resolved.startsWith(baseDir + path.sep)) {
			throw new Error('Invalid filename: path escapes .newsroom directory');
		}
	}
	return resolved;
}

export async function readNewsroomFileAsync(
	directory: string,
	filename: string,
): Promise<string | null> {
	try {
		const resolvedPath = validateNewsroomPath(directory, filename);
		const file = Bun.file(resolvedPath);
		const content = await file.text();
		return content;
	} catch {
		return null;
	}
}

export function estimateTokens(text: string): number {
	if (!text) {
		return 0;
	}
	return Math.ceil(text.length * 0.33);
}
