import { addDays, startOfDay } from "date-fns";
import { describe, expect, it } from "vitest";

import { getDisplayDate } from "@/utils/displayDate";

describe("getDisplayDate tomorrow", () => {
	it("prefixes tomorrow label for tomorrow date", () => {
		const tomorrow = addDays(startOfDay(new Date()), 1);

		expect(getDisplayDate(tomorrow)).toContain("Ngày mai");
	});
});
