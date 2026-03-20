/**
 * Summarizer
 *
 * Intelligent tool output compression for the newsroom context.
 * Detects content type (text, json, code, markdown) and applies
 * hysteresis to avoid repeated summarization churn.
 *
 * Adapted from opencode-swarm summarizer for editorial content:
 * text = article prose, quotes/citations, analysis
 */

export type ContentType = 'text' | 'json' | 'code' | 'markdown';

/**
 * Hysteresis factor: content must exceed threshold * factor to re-summarize.
 * Prevents oscillation between summarized and unsummarized states.
 */
export const HYSTERESIS_FACTOR = 1.25;

/**
 * Default threshold in characters before summarization kicks in.
 * Outputs shorter than this are kept verbatim.
 */
const DEFAULT_THRESHOLD = 2000;

/**
 * Detects the content type of a string based on structural heuristics.
 */
export function detectContentType(content: string): ContentType {
	if (!content || content.length === 0) return 'text';

	const trimmed = content.trim();

	// Binary / non-printable ratio check
	let nonPrintable = 0;
	const sample = trimmed.slice(0, 500);
	for (let i = 0; i < sample.length; i++) {
		const c = sample.charCodeAt(i);
		if (c < 32 && c !== 9 && c !== 10 && c !== 13) nonPrintable++;
	}
	if (nonPrintable / sample.length > 0.1) {
		// High non-printable ratio — treat as binary/code
		return 'code';
	}

	// JSON detection (must start with { or [ and be parseable)
	if (
		(trimmed.startsWith('{') || trimmed.startsWith('[')) &&
		trimmed.length > 20
	) {
		try {
			JSON.parse(trimmed);
			return 'json';
		} catch {
			// Not valid JSON — fall through
		}
	}

	// Markdown detection (common markdown patterns)
	const markdownPatterns = [
		/^#{1,6}\s+\S/m, // headings
		/^\s*[-*+]\s+\S/m, // unordered lists
		/^\s*\d+\.\s+\S/m, // ordered lists
		/\*\*[^*]+\*\*/, // bold
		/`[^`]+`/, // inline code
		/^```/m, // code fences
		/^\|.+\|/m, // tables
	];
	const markdownMatches = markdownPatterns.filter((p) =>
		p.test(trimmed),
	).length;
	if (markdownMatches >= 2) return 'markdown';

	// Code detection (programming syntax patterns)
	const codePatterns = [
		/^import\s+/m,
		/^export\s+/m,
		/^function\s+\w+/m,
		/^const\s+\w+\s*=/m,
		/^class\s+\w+/m,
		/^\s*def\s+\w+/m,
		/^\s*if\s*\(.*\)\s*\{/m,
		/^\s*for\s*\(/m,
	];
	const codeMatches = codePatterns.filter((p) => p.test(trimmed)).length;
	if (codeMatches >= 2) return 'code';

	return 'text';
}

/**
 * Determines whether a piece of content should be summarized.
 * Applies hysteresis: if content was previously summarized, it must
 * grow by HYSTERESIS_FACTOR before being re-summarized.
 */
export function shouldSummarize(
	content: string,
	threshold = DEFAULT_THRESHOLD,
	previouslySummarized = false,
): boolean {
	const effectiveThreshold = previouslySummarized
		? threshold * HYSTERESIS_FACTOR
		: threshold;
	return content.length > effectiveThreshold;
}

/**
 * Creates a summary of the content, tailored to the detected content type.
 * Returns the summary text and detected content type.
 */
export function createSummary(
	content: string,
	agentName: string,
	maxLength = 500,
): { summary: string; contentType: ContentType } {
	const contentType = detectContentType(content);
	const trimmed = content.trim();

	let preview: string;

	switch (contentType) {
		case 'json': {
			try {
				const parsed = JSON.parse(trimmed);
				const keys =
					typeof parsed === 'object' && parsed !== null
						? Object.keys(parsed).slice(0, 5).join(', ')
						: 'array';
				const len = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
				preview = `[JSON: ${len} ${Array.isArray(parsed) ? 'items' : 'keys'} (${keys}${len > 5 ? '...' : ''})]`;
			} catch {
				preview = trimmed.slice(0, maxLength);
			}
			break;
		}

		case 'code': {
			// Extract first meaningful non-blank, non-comment lines
			const lines = trimmed
				.split('\n')
				.filter((l) => {
					const t = l.trim();
					return t.length > 0 && !t.startsWith('//') && !t.startsWith('#');
				})
				.slice(0, 6);
			preview = `[CODE (${trimmed.split('\n').length} lines)]:\n${lines.join('\n')}`;
			break;
		}

		case 'markdown': {
			// Extract headings and first paragraph
			const headings = trimmed
				.split('\n')
				.filter((l) => /^#{1,6}\s+/.test(l))
				.slice(0, 4)
				.join('\n');
			preview = headings
				? `[MARKDOWN headings]:\n${headings}`
				: trimmed.slice(0, maxLength);
			break;
		}

		default: {
			// Plain text — take first maxLength chars, ending at a word boundary
			if (trimmed.length <= maxLength) {
				preview = trimmed;
			} else {
				const cut = trimmed.lastIndexOf(' ', maxLength);
				preview =
					cut > 0 ? `${trimmed.slice(0, cut)}…` : `${trimmed.slice(0, maxLength)}…`;
			}
			break;
		}
	}

	const summary = `[Summary from ${agentName}] ${preview}`;
	return { summary, contentType };
}
