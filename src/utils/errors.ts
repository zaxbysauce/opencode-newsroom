/**
 * Base error class for all newsroom errors.
 * Includes a machine-readable `code` and a user-facing `guidance` string.
 */
export class NewsroomError extends Error {
	readonly code: string;
	readonly guidance: string;

	constructor(message: string, code: string, guidance: string) {
		super(message);
		this.name = 'NewsroomError';
		this.code = code;
		this.guidance = guidance;
	}
}

/**
 * Error thrown when configuration loading or validation fails.
 */
export class ConfigError extends NewsroomError {
	constructor(message: string, guidance: string) {
		super(message, 'CONFIG_ERROR', guidance);
		this.name = 'ConfigError';
	}
}

/**
 * Error thrown when a hook execution fails.
 */
export class HookError extends NewsroomError {
	constructor(message: string, guidance: string) {
		super(message, 'HOOK_ERROR', guidance);
		this.name = 'HookError';
	}
}

/**
 * Error thrown when a tool execution fails.
 */
export class ToolError extends NewsroomError {
	constructor(message: string, guidance: string) {
		super(message, 'TOOL_ERROR', guidance);
		this.name = 'ToolError';
	}
}

/**
 * Error thrown when CLI operations fail.
 */
export class CLIError extends NewsroomError {
	constructor(message: string, guidance: string) {
		super(message, 'CLI_ERROR', guidance);
		this.name = 'CLIError';
	}
}
