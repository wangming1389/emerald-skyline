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

describe("parsePaymentRedirectUrl defaults", () => {
	it("defaults missing status and source for valid redirects", () => {
		mockedLinking.parse.mockReturnValueOnce({
			queryParams: { txnRef: "TXN-002" },
		});

		expect(parsePaymentRedirectUrl("emerald://payment/result")).toEqual({
			txnRef: "TXN-002",
			status: "processing",
			source: "gateway",
			amount: undefined,
			paymentMethod: undefined,
		});
	});
});
