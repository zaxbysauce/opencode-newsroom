import { describe, expect, test } from 'bun:test';
import { createPreCheckBatchTool } from '../../../src/tools/summary-tools';

type ToolDef = { execute: (args: { content: string; checks?: string[] }) => Promise<string> };
const tool = createPreCheckBatchTool() as unknown as ToolDef;

describe('pre_check_batch — ai_patterns', () => {
	test('passes when no AI patterns present', async () => {
		const result = await tool.execute({
			content: 'The reporter found clear evidence at the scene.',
			checks: ['ai_patterns'],
		});
		expect(result).toContain('✅ AI patterns: None detected');
	});

	test('warns on 1-2 AI patterns', async () => {
		const result = await tool.execute({
			content: 'The situation is nuanced and requires delve into the details.',
			checks: ['ai_patterns'],
		});
		expect(result).toContain('⚠️ AI patterns');
	});

	test('fails on 3+ AI patterns', async () => {
		const result = await tool.execute({
			content: 'Moreover, it is worth noting that the holistic approach will leverage synergy.',
			checks: ['ai_patterns'],
		});
		expect(result).toContain('❌ AI patterns');
	});

	test('AI pattern check is case-insensitive', async () => {
		const result = await tool.execute({
			content: 'LEVERAGE the SYNERGY to UTILIZE the HOLISTIC approach.',
			checks: ['ai_patterns'],
		});
		expect(result).toContain('❌ AI patterns');
	});
});

describe('pre_check_batch — word_count', () => {
	test('reports word count', async () => {
		const result = await tool.execute({
			content: 'one two three four five',
			checks: ['word_count'],
		});
		expect(result).toContain('Word count: 5');
	});
});

describe('pre_check_batch — sentence_length', () => {
	test('passes for short sentences', async () => {
		const result = await tool.execute({
			content: 'Short sentence. Another short one. One more here.',
			checks: ['sentence_length'],
		});
		expect(result).toContain('✅ Sentence length');
	});

	test('warns for long average sentence length', async () => {
		const longSentence =
			'This is a very long sentence that contains many many many many many words and it just keeps going and going without any real structure or purpose and it really should be broken up.';
		const result = await tool.execute({
			content: longSentence,
			checks: ['sentence_length'],
		});
		expect(result).toMatch(/⚠️|❌/);
		expect(result).toContain('Sentence length');
	});
});

describe('pre_check_batch — defaults to all checks', () => {
	test('runs all checks when no checks specified', async () => {
		const result = await tool.execute({
			content: 'The reporter covered the story carefully.',
		});
		expect(result).toContain('Word count');
		expect(result).toContain('Sentence length');
		expect(result).toContain('AI patterns');
		expect(result).toContain('Passive voice');
		expect(result).toContain('Readability');
	});
});
