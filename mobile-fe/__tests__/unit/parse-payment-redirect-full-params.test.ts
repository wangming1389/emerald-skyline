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

describe("parsePaymentRedirectUrl full params", () => {
	it("extracts all supported query params from a gateway URL", () => {
		mockedLinking.parse.mockReturnValueOnce({
			queryParams: {
				txnRef: "TXN-001",
				status: "success",
				source: "gateway",
				amount: "250000",
				paymentMethod: "VNPAY",
			},
		});

		expect(parsePaymentRedirectUrl("emerald://payment/result")).toEqual({
			txnRef: "TXN-001",
			status: "success",
			source: "gateway",
			amount: "250000",
			paymentMethod: "VNPAY",
		});
	});
});
