import { describe, expect, it } from "vitest";

import { formatDuration } from "@/utils/formatDuration";

describe("formatDuration minutes", () => {
	it("formats minutes below one hour", () => {
		expect(formatDuration(45)).toBe("45p");
	});
});
