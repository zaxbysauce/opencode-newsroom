import { describe, expect, test, beforeEach } from "bun:test";
import {
	newsroomState,
	resetNewsroomState,
	startAgentSession,
	endAgentSession,
	getAgentSession,
} from "../../../src/state";

describe("state module", () => {
	beforeEach(() => {
		resetNewsroomState();
	});

	test("newsroomState starts with empty maps", () => {
		expect(newsroomState.activeToolCalls.size).toBe(0);
		expect(newsroomState.toolAggregates.size).toBe(0);
		expect(newsroomState.activeAgent.size).toBe(0);
		expect(newsroomState.delegationChains.size).toBe(0);
		expect(newsroomState.pendingEvents).toBe(0);
		expect(newsroomState.agentSessions.size).toBe(0);
	});

	test("resetNewsroomState clears all state", () => {
		// Add some state
		newsroomState.pendingEvents = 5;
		newsroomState.agentSessions.set("session1", {
			agentName: "test",
			startTime: Date.now(),
			toolCallCount: 1,
			consecutiveErrors: 0,
			recentToolCalls: [],
			warningIssued: false,
			hardLimitHit: false,
		});

		// Reset
		resetNewsroomState();

		// Verify all state is cleared
		expect(newsroomState.activeToolCalls.size).toBe(0);
		expect(newsroomState.toolAggregates.size).toBe(0);
		expect(newsroomState.activeAgent.size).toBe(0);
		expect(newsroomState.delegationChains.size).toBe(0);
		expect(newsroomState.pendingEvents).toBe(0);
		expect(newsroomState.agentSessions.size).toBe(0);
	});

	test("startAgentSession creates session with correct initial values", () => {
		const sessionId = "test-session-1";
		const agentName = "test-agent";

		startAgentSession(sessionId, agentName);

		const session = getAgentSession(sessionId);
		expect(session).toBeDefined();
		expect(session!.agentName).toBe(agentName);
		expect(session!.startTime).toBeGreaterThanOrEqual(Date.now() - 1000);
		expect(session!.toolCallCount).toBe(0);
		expect(session!.consecutiveErrors).toBe(0);
		expect(session!.recentToolCalls).toEqual([]);
		expect(session!.warningIssued).toBe(false);
		expect(session!.hardLimitHit).toBe(false);
	});

	test("getAgentSession returns the session", () => {
		const sessionId = "test-session-2";
		const agentName = "test-agent-2";

		startAgentSession(sessionId, agentName);

		const session = getAgentSession(sessionId);
		expect(session).toBeDefined();
		expect(session!.agentName).toBe(agentName);
	});

	test("getAgentSession returns undefined for non-existent session", () => {
		const session = getAgentSession("non-existent-session");
		expect(session).toBeUndefined();
	});

	test("endAgentSession removes the session", () => {
		const sessionId = "test-session-3";
		startAgentSession(sessionId, "test-agent-3");

		expect(getAgentSession(sessionId)).toBeDefined();

		endAgentSession(sessionId);

		expect(getAgentSession(sessionId)).toBeUndefined();
	});

	test("startAgentSession evicts stale sessions (set staleDurationMs=0 to evict everything)", () => {
		const sessionId1 = "session-fresh";
		const sessionId2 = "session-stale";
		const sessionId3 = "session-new";

		// Create a fresh session
		startAgentSession(sessionId1, "test-agent-1");

		// Manually create a stale session with old timestamp
		const oldNow = Date.now() - 10000; // 10 seconds ago
		newsroomState.agentSessions.set(
			sessionId2,
			{
				agentName: "test-agent",
				startTime: oldNow,
				toolCallCount: 1,
				consecutiveErrors: 0,
				recentToolCalls: [],
				warningIssued: false,
				hardLimitHit: false,
			},
		);

		// Start new session with staleDurationMs=0 to evict everything older than 0ms
		startAgentSession(sessionId3, "test-agent-3", 0);

		// Stale session should be evicted, fresh session1 might also be evicted (age > 0ms)
		expect(getAgentSession(sessionId2)).toBeUndefined();
		// New session should exist
		expect(getAgentSession(sessionId3)).toBeDefined();
	});

	test("startAgentSession does not evict fresh sessions", () => {
		const sessionId1 = "session-1";
		const sessionId2 = "session-2";

		// Create two fresh sessions
		startAgentSession(sessionId1, "test-agent-1");
		startAgentSession(sessionId2, "test-agent-2");

		// Start a new session with default staleDurationMs (1 hour)
		// Should not evict any fresh sessions
		startAgentSession("session-3", "test-agent-3");

		// Verify all three sessions still exist
		expect(getAgentSession(sessionId1)).toBeDefined();
		expect(getAgentSession(sessionId2)).toBeDefined();
		expect(getAgentSession("session-3")).toBeDefined();
	});

	test("Multiple sessions can coexist", () => {
		const sessionIds = ["session-1", "session-2", "session-3", "session-4"];

		// Create multiple sessions
		sessionIds.forEach((id, index) => {
			startAgentSession(id, `test-agent-${index}`);
		});

		// Verify all sessions exist
		sessionIds.forEach((id) => {
			const session = getAgentSession(id);
			expect(session).toBeDefined();
			expect(session!.agentName).toBe(`test-agent-${sessionIds.indexOf(id)}`);
		});

		// Verify count
		expect(newsroomState.agentSessions.size).toBe(4);
	});

	test("pendingEvents can be incremented and reset", () => {
		// Start at 0
		expect(newsroomState.pendingEvents).toBe(0);

		// Increment
		newsroomState.pendingEvents = 5;
		expect(newsroomState.pendingEvents).toBe(5);

		newsroomState.pendingEvents = 10;
		expect(newsroomState.pendingEvents).toBe(10);

		// Reset
		resetNewsroomState();
		expect(newsroomState.pendingEvents).toBe(0);
	});
});
