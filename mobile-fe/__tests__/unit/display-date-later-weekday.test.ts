import { addDays, startOfDay } from "date-fns";
import { describe, expect, it } from "vitest";

import { getDisplayDate } from "@/utils/displayDate";

describe("getDisplayDate later weekday", () => {
	it("returns weekday only for later dates", () => {
		const later = addDays(startOfDay(new Date()), 3);
		const text = getDisplayDate(later);

		expect(text).not.toContain("Hôm nay");
		expect(text).not.toContain("Ngày mai");
		expect(text.length).toBeGreaterThan(0);
	});
});
