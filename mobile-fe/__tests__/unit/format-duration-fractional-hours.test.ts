import { describe, expect, it } from "vitest";

import { formatDuration } from "@/utils/formatDuration";

describe("formatDuration fractional hours", () => {
	it("formats fractional hours when minutes remain", () => {
		expect(formatDuration(90)).toBe("1.5h");
	});
});
