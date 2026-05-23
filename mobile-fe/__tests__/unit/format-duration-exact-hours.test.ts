import { describe, expect, it } from "vitest";

import { formatDuration } from "@/utils/formatDuration";

describe("formatDuration exact hours", () => {
	it("formats exact hours", () => {
		expect(formatDuration(120)).toBe("2h");
	});
});
