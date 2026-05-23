import { describe, expect, it } from "vitest";

import { formatDuration } from "@/utils/formatDuration";

describe("formatDuration zero", () => {
	it("returns 0p for falsy values", () => {
		expect(formatDuration(0)).toBe("0p");
	});
});
