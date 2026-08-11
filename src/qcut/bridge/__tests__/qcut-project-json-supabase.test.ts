import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMock = vi.fn();
const selectSnapshotMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
	supabase: {
		from: vi.fn(() => ({
			update: (payload: unknown) => {
				updateMock(payload);
				const chain = {
					eq: () => chain,
					select: () => chain,
					limit: () =>
						Promise.resolve({
							data: [{ updated_at: "2026-01-01T00:00:00Z" }],
							error: null,
						}),
				};
				return chain;
			},
			select: () => ({
				eq: () => ({
					maybeSingle: selectSnapshotMock,
					single: () =>
						Promise.resolve({
							data: { updated_at: "2026-01-01T00:00:00Z" },
							error: null,
						}),
				}),
			}),
		})),
	},
}));

const buildSnapshotMock = vi.fn();
vi.mock("../qcut-snapshot", () => ({
	buildQcutSnapshotV1: (id: string) => buildSnapshotMock(id),
}));

import { writeQcutSnapshotToSupabase } from "../qcut-project-json-supabase";
import {
	clearSnapshotHydrationPending,
	markSnapshotHydrationDone,
	markSnapshotHydrationPending,
	setWzrdProjectContext,
} from "../wzrd-project-context";

const emptySnapshot = { version: 1, timeline: { tracks: [] } };
const filledSnapshot = {
	version: 1,
	timeline: { tracks: [{ elements: [{ id: "el-1" }] }] },
};

let counter = 0;
function makeIds() {
	counter += 1;
	const wzrdProjectId = `wzrd-project-${counter}`;
	const qcutProjectId = `wzrd:${wzrdProjectId}`;
	setWzrdProjectContext({ wzrdProjectId, qcutProjectId });
	return { wzrdProjectId, qcutProjectId };
}

describe("writeQcutSnapshotToSupabase guards", () => {
	beforeEach(() => {
		updateMock.mockClear();
		selectSnapshotMock.mockClear();
		buildSnapshotMock.mockReset();
	});

	it("skips the write entirely while hydration is pending", async () => {
		const { qcutProjectId } = makeIds();
		markSnapshotHydrationPending(qcutProjectId);
		buildSnapshotMock.mockResolvedValue(filledSnapshot);

		await writeQcutSnapshotToSupabase(qcutProjectId);

		expect(buildSnapshotMock).not.toHaveBeenCalled();
		expect(updateMock).not.toHaveBeenCalled();

		clearSnapshotHydrationPending(qcutProjectId);
		await writeQcutSnapshotToSupabase(qcutProjectId);
		expect(updateMock).toHaveBeenCalled();
	});

	it("refuses to overwrite stored timeline content with an empty snapshot before hydration", async () => {
		const { qcutProjectId } = makeIds();
		buildSnapshotMock.mockResolvedValue(emptySnapshot);
		selectSnapshotMock.mockResolvedValue({
			data: { qcut_project_json: filledSnapshot },
			error: null,
		});

		await writeQcutSnapshotToSupabase(qcutProjectId);

		expect(selectSnapshotMock).toHaveBeenCalled();
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("allows an empty write when the stored snapshot is also empty", async () => {
		const { qcutProjectId } = makeIds();
		buildSnapshotMock.mockResolvedValue(emptySnapshot);
		selectSnapshotMock.mockResolvedValue({
			data: { qcut_project_json: emptySnapshot },
			error: null,
		});

		await writeQcutSnapshotToSupabase(qcutProjectId);

		expect(updateMock).toHaveBeenCalledWith({
			qcut_project_json: emptySnapshot,
		});
	});

	it("allows an empty write after hydration has completed (intentional clear)", async () => {
		const { qcutProjectId } = makeIds();
		markSnapshotHydrationDone(qcutProjectId);
		buildSnapshotMock.mockResolvedValue(emptySnapshot);

		await writeQcutSnapshotToSupabase(qcutProjectId);

		expect(selectSnapshotMock).not.toHaveBeenCalled();
		expect(updateMock).toHaveBeenCalledWith({
			qcut_project_json: emptySnapshot,
		});
	});

	it("writes non-empty snapshots without consulting the stored copy", async () => {
		const { qcutProjectId } = makeIds();
		buildSnapshotMock.mockResolvedValue(filledSnapshot);

		await writeQcutSnapshotToSupabase(qcutProjectId);

		expect(selectSnapshotMock).not.toHaveBeenCalled();
		expect(updateMock).toHaveBeenCalledWith({
			qcut_project_json: filledSnapshot,
		});
	});
});
