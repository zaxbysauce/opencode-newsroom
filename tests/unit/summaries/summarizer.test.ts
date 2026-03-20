import { describe, expect, test } from 'bun:test';
import {
	HYSTERESIS_FACTOR,
	createSummary,
	detectContentType,
	shouldSummarize,
} from '../../../src/summaries/summarizer';

describe('detectContentType', () => {
	test('returns text for empty string', () => {
		expect(detectContentType('')).toBe('text');
	});

	test('detects JSON objects', () => {
		expect(detectContentType('{"key": "value", "count": 42}')).toBe('json');
	});

	test('detects JSON arrays', () => {
		// Must be > 20 chars to trigger JSON detection path
		expect(detectContentType('[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]')).toBe('json');
	});

	test('falls through on invalid JSON', () => {
		// Looks like JSON but is not valid — falls through to text/markdown
		const result = detectContentType('{ not valid json }');
		expect(['text', 'markdown', 'code']).toContain(result);
	});

	test('detects markdown with multiple indicators', () => {
		const md = `# Heading\n\n- Item 1\n- Item 2\n\n**Bold text**\n\n\`code\``;
		expect(detectContentType(md)).toBe('markdown');
	});

	test('detects code with multiple programming patterns', () => {
		const code = `import React from 'react';\nexport function Foo() {\n  const x = 1;\n  return x;\n}`;
		expect(detectContentType(code)).toBe('code');
	});

	test('returns text for plain prose', () => {
		const prose = 'The article discusses several key topics related to climate change and its effects on ecosystems.';
		expect(detectContentType(prose)).toBe('text');
	});
});

describe('shouldSummarize', () => {
	test('returns false for short content below threshold', () => {
		expect(shouldSummarize('short text', 2000)).toBe(false);
	});

	test('returns true for content above threshold', () => {
		const longText = 'x'.repeat(2001);
		expect(shouldSummarize(longText, 2000)).toBe(true);
	});

	test('applies hysteresis when previously summarized', () => {
		// Content at exactly threshold — should be false when previously summarized
		const atThreshold = 'x'.repeat(2000);
		expect(shouldSummarize(atThreshold, 2000, false)).toBe(false);
		expect(shouldSummarize(atThreshold, 2000, true)).toBe(false);
	});

	test('hysteresis requires HYSTERESIS_FACTOR times threshold', () => {
		// Content must exceed threshold * HYSTERESIS_FACTOR to re-summarize
		const overThreshold = 'x'.repeat(2001);
		expect(shouldSummarize(overThreshold, 2000, false)).toBe(true);

		// At threshold * HYSTERESIS_FACTOR exactly — must be false when previously summarized
		const atHysteresis = 'x'.repeat(Math.floor(2000 * HYSTERESIS_FACTOR));
		expect(shouldSummarize(atHysteresis, 2000, true)).toBe(false);
	});

	test('HYSTERESIS_FACTOR is 1.25', () => {
		expect(HYSTERESIS_FACTOR).toBe(1.25);
	});
});

describe('createSummary', () => {
	test('returns summary with agent name prefix', () => {
		const { summary } = createSummary('hello world', 'writer');
		expect(summary).toContain('[Summary from writer]');
	});

	test('summarizes JSON content with key/length info', () => {
		// JSON must be > 20 chars to trigger JSON detection
		const json = JSON.stringify({ title: 'article', phase: 1, status: 'in_progress' });
		const { summary, contentType } = createSummary(json, 'researcher');
		expect(contentType).toBe('json');
		expect(summary).toContain('[JSON:');
	});

	test('summarizes markdown with headings', () => {
		// Need at least 2 different markdown patterns (heading + list)
		const md = '# Article Title\n\n- Item one\n- Item two\n\n**Bold text** here.\n\n## Section Two\n\nMore content.';
		const { summary, contentType } = createSummary(md, 'writer');
		expect(contentType).toBe('markdown');
		expect(summary).toContain('MARKDOWN headings');
	});

	test('truncates long text at word boundary', () => {
		const longText = 'hello world '.repeat(100);
		const { summary, contentType } = createSummary(longText, 'writer', 50);
		expect(contentType).toBe('text');
		expect(summary.length).toBeLessThan(longText.length);
		expect(summary).toContain('…');
	});

	test('returns text verbatim when short enough', () => {
		const shortText = 'Short article text.';
		const { summary } = createSummary(shortText, 'writer', 500);
		expect(summary).toContain(shortText);
	});
});
