import { describe, expect, test } from 'bun:test';
import {
	generateKnowledgeId,
	validateKnowledgeId,
} from '../../../src/knowledge/identity';

describe('validateKnowledgeId', () => {
	test('accepts simple alphanumeric IDs', () => {
		expect(validateKnowledgeId('abc123')).toBe('abc123');
		expect(validateKnowledgeId('K12345')).toBe('K12345');
	});

	test('accepts IDs with dashes and underscores', () => {
		expect(validateKnowledgeId('my-entry')).toBe('my-entry');
		expect(validateKnowledgeId('my_entry')).toBe('my_entry');
		expect(validateKnowledgeId('K1234567890-abc')).toBe('K1234567890-abc');
	});

	test('accepts single character ID', () => {
		expect(validateKnowledgeId('A')).toBe('A');
	});

	test('rejects empty string', () => {
		expect(() => validateKnowledgeId('')).toThrow('empty string');
	});

	test('rejects IDs with path traversal', () => {
		expect(() => validateKnowledgeId('../secret')).toThrow('path traversal');
		expect(() => validateKnowledgeId('foo/bar')).toThrow('path traversal');
		expect(() => validateKnowledgeId('foo\\bar')).toThrow('path traversal');
	});

	test('rejects IDs starting with dash or underscore', () => {
		expect(() => validateKnowledgeId('-foo')).toThrow('Invalid knowledge ID');
		expect(() => validateKnowledgeId('_foo')).toThrow('Invalid knowledge ID');
	});

	test('rejects IDs with spaces or special chars', () => {
		expect(() => validateKnowledgeId('my entry')).toThrow('Invalid knowledge ID');
		expect(() => validateKnowledgeId('my@entry')).toThrow('Invalid knowledge ID');
	});

	test('rejects IDs exceeding 64 characters', () => {
		const longId = 'a'.repeat(65);
		expect(() => validateKnowledgeId(longId)).toThrow('Invalid knowledge ID');
	});

	test('accepts exactly 64 characters', () => {
		const maxId = 'A' + 'a'.repeat(63);
		expect(validateKnowledgeId(maxId)).toBe(maxId);
	});
});

describe('generateKnowledgeId', () => {
	test('returns a string starting with K', () => {
		const id = generateKnowledgeId();
		expect(id).toMatch(/^K\d+-[a-z0-9]+$/);
	});

	test('generates unique IDs', () => {
		const ids = new Set(Array.from({ length: 10 }, () => generateKnowledgeId()));
		// All 10 should be unique (very high probability given timestamp + random suffix)
		expect(ids.size).toBe(10);
	});

	test('generated ID passes validation', () => {
		const id = generateKnowledgeId();
		expect(() => validateKnowledgeId(id)).not.toThrow();
	});
});
