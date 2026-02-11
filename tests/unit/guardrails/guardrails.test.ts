import {
	hashArgs,
	createGuardrailsHooks,
} from "../../../src/hooks/guardrails";
import { resetNewsroomState, startAgentSession, getAgentSession } from "../../../src/state";
import { describe, expect, test, beforeEach } from "bun:test";

describe("hashArgs", () => {
	beforeEach(() => {
		resetNewsroomState();
	});

	test("returns 0 for null", () => {
		expect(hashArgs(null)).toBe(0);
	});

	test("returns 0 for non-object (string)", () => {
		expect(hashArgs("test")).toBe(0);
		expect(hashArgs("")).toBe(0);
	});

	test("returns 0 for non-object (number)", () => {
		expect(hashArgs(42)).toBe(0);
		expect(hashArgs(0)).toBe(0);
		expect(hashArgs(-1)).toBe(0);
	});

	test("returns 0 for undefined", () => {
		expect(hashArgs(undefined)).toBe(0);
	});

	test("returns a number for a valid object", () => {
		const result = hashArgs({ a: 1, b: 2 });
		expect(typeof result).toBe("number");
		expect(result).toBeGreaterThan(0);
	});

	test("returns same hash for same object", () => {
		const obj1 = { a: 1, b: 2 };
		const obj2 = { a: 1, b: 2 };
		expect(hashArgs(obj1)).toBe(hashArgs(obj2));
	});

	test("returns different hash for different objects", () => {
		const obj1 = { a: 1, b: 2 };
		const obj2 = { a: 2, b: 1 };
		const obj3 = { a: 1 };
		expect(hashArgs(obj1)).not.toBe(hashArgs(obj2));
		expect(hashArgs(obj1)).not.toBe(hashArgs(obj3));
	});

	test("returns same hash for same object with different key order", () => {
		const obj1 = { a: 1, b: 2, c: 3 };
		const obj2 = { c: 3, b: 2, a: 1 };
		expect(hashArgs(obj1)).toBe(hashArgs(obj2));
	});
});

describe("createGuardrailsHooks", () => {
	beforeEach(() => {
		resetNewsroomState();
	});

	test("returns no-op hooks when enabled=false", () => {
		const hooks = createGuardrailsHooks({ enabled: false });
		expect(typeof hooks.toolBefore).toBe("function");
		expect(typeof hooks.toolAfter).toBe("function");
		expect(typeof hooks.messagesTransform).toBe("function");

		// Verify hooks are no-ops by calling them
		void hooks.toolBefore({ tool: "test", sessionID: "sess-1", callID: "call-1" }, { args: {} });
		void hooks.toolAfter({ tool: "test", sessionID: "sess-1", callID: "call-1" }, { title: "test", output: "ok", metadata: {} });

		// Session should not be created
		expect(getAgentSession("sess-1")).toBeUndefined();
	});

	test("toolBefore increments tool call count", async () => {
		const hooks = createGuardrailsHooks({ enabled: true });
		startAgentSession("sess-1", "test-agent");

		// First call
		await hooks.toolBefore({ tool: "test", sessionID: "sess-1", callID: "call-1" }, { args: {} });
		const session1 = getAgentSession("sess-1");
		expect(session1?.toolCallCount).toBe(1);

		// Second call
		await hooks.toolBefore({ tool: "test", sessionID: "sess-1", callID: "call-2" }, { args: {} });
		const session2 = getAgentSession("sess-1");
		expect(session2?.toolCallCount).toBe(2);
	});

	test("toolBefore throws at max_tool_calls limit", async () => {
		const maxCalls = 3;
		const hooks = createGuardrailsHooks({ enabled: true, max_tool_calls: maxCalls });
		startAgentSession("sess-1", "test-agent");

		// First call succeeds
		await hooks.toolBefore({ tool: "test", sessionID: "sess-1", callID: "call-1" }, { args: {} });
		const session1 = getAgentSession("sess-1");
		expect(session1?.toolCallCount).toBe(1);

		// Second call succeeds
		await hooks.toolBefore({ tool: "test", sessionID: "sess-1", callID: "call-2" }, { args: {} });
		const session2 = getAgentSession("sess-1");
		expect(session2?.toolCallCount).toBe(2);

		// Third call hits the limit (3 >= 3) and should throw
		await expect(
			hooks.toolBefore({ tool: "test", sessionID: "sess-1", callID: "call-3" }, { args: {} }),
		).rejects.toThrow("CIRCUIT BREAKER: Tool call limit reached");
	});

	test("toolBefore creates session if not exists", async () => {
		const hooks = createGuardrailsHooks({ enabled: true });
		const sessionID = "sess-1";
		const agentName = "test-agent";

		// Call toolBefore without starting session
		await hooks.toolBefore({ tool: "test", sessionID, callID: "call-1" }, { args: {} });

		// Session should be created
		const session = getAgentSession(sessionID);
		expect(session).toBeDefined();
		expect(session?.agentName).toBe("unknown");
	});

	test("toolBefore updates agent name if unknown", async () => {
		const hooks = createGuardrailsHooks({ enabled: true });
		const sessionID = "sess-1";

		// Start session with unknown agent name
		startAgentSession(sessionID, "unknown");

		// Call toolBefore
		await hooks.toolBefore({ tool: "test", sessionID, callID: "call-1" }, { args: {} });

		// Agent name should be updated
		const session = getAgentSession(sessionID);
		expect(session?.agentName).toBe("unknown");
	});

	test("toolAfter tracks consecutive errors (output = null)", async () => {
		const hooks = createGuardrailsHooks({ enabled: true });
		startAgentSession("sess-1", "test-agent");

		// First error
		await hooks.toolAfter({ tool: "test", sessionID: "sess-1", callID: "call-1" }, {
			title: "test",
			output: null,
			metadata: {},
		});
		const session1 = getAgentSession("sess-1");
		expect(session1?.consecutiveErrors).toBe(1);

		// Second error
		await hooks.toolAfter({ tool: "test", sessionID: "sess-1", callID: "call-2" }, {
			title: "test",
			output: null,
			metadata: {},
		});
		const session2 = getAgentSession("sess-1");
		expect(session2?.consecutiveErrors).toBe(2);
	});

	test("toolAfter resets errors on success (output = 'ok')", async () => {
		const hooks = createGuardrailsHooks({ enabled: true });
		startAgentSession("sess-1", "test-agent");

		// Track some errors
		await hooks.toolAfter({ tool: "test", sessionID: "sess-1", callID: "call-1" }, {
			title: "test",
			output: null,
			metadata: {},
		});
		await hooks.toolAfter({ tool: "test", sessionID: "sess-1", callID: "call-2" }, {
			title: "test",
			output: null,
			metadata: {},
		});

		// Success should reset errors
		await hooks.toolAfter({ tool: "test", sessionID: "sess-1", callID: "call-3" }, {
			title: "test",
			output: "ok",
			metadata: {},
		});

		const session = getAgentSession("sess-1");
		expect(session?.consecutiveErrors).toBe(0);
	});

	test("toolAfter handles undefined output", async () => {
		const hooks = createGuardrailsHooks({ enabled: true });
		startAgentSession("sess-1", "test-agent");

		// Undefined output should increment errors
		await hooks.toolAfter({ tool: "test", sessionID: "sess-1", callID: "call-1" }, {
			title: "test",
			output: undefined as unknown,
			metadata: {},
		});

		const session = getAgentSession("sess-1");
		expect(session?.consecutiveErrors).toBe(1);
	});

	test("messagesTransform is a function", async () => {
		const hooks = createGuardrailsHooks({ enabled: true });
		expect(typeof hooks.messagesTransform).toBe("function");

		// Calling messagesTransform should not throw
		await hooks.messagesTransform({}, { messages: [] });
	});
});
