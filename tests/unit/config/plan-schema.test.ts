import { describe, expect, test } from "bun:test";

import {
	PlanSchema,
	TaskSchema,
	PhaseSchema,
	TaskStatusSchema,
	TaskSizeSchema,
} from "../../../src/config/plan-schema";

describe("plan-schema", () => {
	describe("PlanSchema", () => {
		test("validates complete plan with all required fields", () => {
			const result = PlanSchema.safeParse({
				schema_version: "1.0.0",
				title: "Test Plan",
				swarm: "opencode-swarm",
				current_phase: 1,
				phases: [
					{
						id: 1,
						name: "Scaffolding",
						status: "pending",
						tasks: [],
					},
				],
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.schema_version).toBe("1.0.0");
				expect(result.data.title).toBe("Test Plan");
				expect(result.data.swarm).toBe("opencode-swarm");
				expect(result.data.current_phase).toBe(1);
				expect(result.data.phases).toHaveLength(1);
			}
		});

		test("validates plan with missing required plan fields", () => {
			const result = PlanSchema.safeParse({
				title: "Test Plan",
				swarm: "opencode-swarm",
				current_phase: 1,
				phases: [],
			});
			expect(result.success).toBe(false);
		});

		test("validates plan with missing schema_version", () => {
			const result = PlanSchema.safeParse({
				title: "Test Plan",
				swarm: "opencode-swarm",
				current_phase: 1,
				phases: [],
			});
			expect(result.success).toBe(false);
		});

		test("validates plan with missing title", () => {
			const result = PlanSchema.safeParse({
				schema_version: "1.0.0",
				swarm: "opencode-swarm",
				current_phase: 1,
				phases: [],
			});
			expect(result.success).toBe(false);
		});

		test("validates plan with missing swarm", () => {
			const result = PlanSchema.safeParse({
				schema_version: "1.0.0",
				title: "Test Plan",
				current_phase: 1,
				phases: [],
			});
			expect(result.success).toBe(false);
		});

		test("validates plan with missing current_phase", () => {
			const result = PlanSchema.safeParse({
				schema_version: "1.0.0",
				title: "Test Plan",
				swarm: "opencode-swarm",
				phases: [],
			});
			expect(result.success).toBe(false);
		});

		test("validates multiple phases are allowed", () => {
			const result = PlanSchema.safeParse({
				schema_version: "1.0.0",
				title: "Multi-Phase Plan",
				swarm: "opencode-swarm",
				current_phase: 2,
				phases: [
					{ id: 1, name: "Phase 1", status: "pending", tasks: [] },
					{ id: 2, name: "Phase 2", status: "pending", tasks: [] },
					{ id: 3, name: "Phase 3", status: "pending", tasks: [] },
				],
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.phases).toHaveLength(3);
				expect(result.data.current_phase).toBe(2);
			}
		});

		test("validates plan with migration_status optional field", () => {
			const result = PlanSchema.safeParse({
				schema_version: "1.0.0",
				title: "Plan",
				swarm: "swarm",
				current_phase: 1,
				phases: [{ id: 1, name: "Phase 1" }],
				migration_status: "native",
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.migration_status).toBe("native");
			}
		});

		test("validates plan without migration_status is also valid", () => {
			const result = PlanSchema.safeParse({
				schema_version: "1.0.0",
				title: "Plan",
				swarm: "swarm",
				current_phase: 1,
				phases: [{ id: 1, name: "Phase 1" }],
			});
			expect(result.success).toBe(true);
		});

		test("rejects plan with empty phases array", () => {
			const result = PlanSchema.safeParse({
				schema_version: "1.0.0",
				title: "Plan",
				swarm: "swarm",
				current_phase: 1,
				phases: [],
			});
			expect(result.success).toBe(false);
		});
	});

	describe("TaskSchema", () => {
		test("validates task with dependencies parses correctly", () => {
			const result = TaskSchema.safeParse({
				id: "1.1",
				phase: 1,
				status: "pending",
				size: "medium",
				description: "Create package.json",
				depends: ["1.2", "2.3"],
				acceptance: "Package.json must exist",
				files_touched: ["package.json"],
				evidence_path: ".newsroom/evidence/1.1",
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.id).toBe("1.1");
				expect(result.data.depends).toEqual(["1.2", "2.3"]);
				expect(result.data.acceptance).toBe("Package.json must exist");
				expect(result.data.files_touched).toEqual(["package.json"]);
				expect(result.data.evidence_path).toBe(".newsroom/evidence/1.1");
			}
		});

		test("task gets default status='pending'", () => {
			const result = TaskSchema.safeParse({
				id: "2.1",
				phase: 2,
				description: "Write tests",
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.status).toBe("pending");
			}
		});

		test("task gets default size='small'", () => {
			const result = TaskSchema.safeParse({
				id: "3.1",
				phase: 3,
				description: "Test task",
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.size).toBe("small");
			}
		});

		test("task gets default depends=[]", () => {
			const result = TaskSchema.safeParse({
				id: "4.1",
				phase: 4,
				description: "Task",
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.depends).toEqual([]);
			}
		});

		test("task gets default files_touched=[]", () => {
			const result = TaskSchema.safeParse({
				id: "5.1",
				phase: 5,
				description: "Task",
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.files_touched).toEqual([]);
			}
		});

		test("invalid task status is rejected", () => {
			const result = TaskSchema.safeParse({
				id: "6.1",
				phase: 6,
				status: "invalid", // Invalid status
				description: "Task",
			});
			expect(result.success).toBe(false);
		});

		test("invalid task size is rejected", () => {
			const result = TaskSchema.safeParse({
				id: "7.1",
				phase: 7,
				size: "huge", // Invalid size
				description: "Task",
			});
			expect(result.success).toBe(false);
		});

		test("valid task status in_progress is accepted", () => {
			const result = TaskSchema.safeParse({
				id: "8.1",
				phase: 8,
				status: "in_progress",
				size: "medium",
				description: "Task",
			});
			expect(result.success).toBe(true);
		});

		test("valid task size large is accepted", () => {
			const result = TaskSchema.safeParse({
				id: "9.1",
				phase: 9,
				status: "pending",
				size: "large",
				description: "Task",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("PhaseSchema", () => {
		test("phase gets default status='pending'", () => {
			const result = PhaseSchema.safeParse({
				id: 1,
				name: "Scaffolding",
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.status).toBe("pending");
			}
		});

		test("phase gets default tasks=[]", () => {
			const result = PhaseSchema.safeParse({
				id: 2,
				name: "Agents",
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.tasks).toEqual([]);
			}
		});

		test("invalid phase status is rejected", () => {
			const result = PhaseSchema.safeParse({
				id: 3,
				name: "Phase",
				status: "invalid", // Invalid status
			});
			expect(result.success).toBe(false);
		});

		test("valid phase status in_progress is accepted", () => {
			const result = PhaseSchema.safeParse({
				id: 4,
				name: "Phase",
				status: "in_progress",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("TaskStatusSchema", () => {
		test("validates pending status", () => {
			const result = TaskStatusSchema.safeParse("pending");
			expect(result.success).toBe(true);
		});

		test("validates in_progress status", () => {
			const result = TaskStatusSchema.safeParse("in_progress");
			expect(result.success).toBe(true);
		});

		test("validates completed status", () => {
			const result = TaskStatusSchema.safeParse("completed");
			expect(result.success).toBe(true);
		});

		test("validates blocked status", () => {
			const result = TaskStatusSchema.safeParse("blocked");
			expect(result.success).toBe(true);
		});

		test("rejects invalid status", () => {
			const result = TaskStatusSchema.safeParse("invalid");
			expect(result.success).toBe(false);
		});
	});

	describe("TaskSizeSchema", () => {
		test("validates small size", () => {
			const result = TaskSizeSchema.safeParse("small");
			expect(result.success).toBe(true);
		});

		test("validates medium size", () => {
			const result = TaskSizeSchema.safeParse("medium");
			expect(result.success).toBe(true);
		});

		test("validates large size", () => {
			const result = TaskSizeSchema.safeParse("large");
			expect(result.success).toBe(true);
		});

		test("rejects invalid size", () => {
			const result = TaskSizeSchema.safeParse("huge");
			expect(result.success).toBe(false);
		});
	});
});
