import { describe, expect, it, vi } from "vitest";

const { mockedLinking, mockedRouter } = vi.hoisted(() => ({
	mockedLinking: {
		parse: vi.fn(),
	},
	mockedRouter: {
		replace: vi.fn(),
	},
}));

vi.mock("expo-linking", () => mockedLinking);
vi.mock("expo-router", () => ({
	router: mockedRouter,
}));

import { parsePaymentRedirectUrl } from "@/utils/payment-redirect";

describe("parsePaymentRedirectUrl missing txnRef", () => {
	it("rejects redirects without txnRef", () => {
		mockedLinking.parse.mockReturnValueOnce({
			queryParams: { status: "success" },
		});

		expect(parsePaymentRedirectUrl("emerald://payment/result")).toBeNull();
	});
});
