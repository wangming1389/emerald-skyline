import { startOfDay } from "date-fns";
import { describe, expect, it } from "vitest";

import { getDisplayDate } from "@/utils/displayDate";

describe("getDisplayDate today", () => {
	it("prefixes today label for current date", () => {
		const today = startOfDay(new Date());

		expect(getDisplayDate(today)).toContain("Hôm nay");
	});
});
