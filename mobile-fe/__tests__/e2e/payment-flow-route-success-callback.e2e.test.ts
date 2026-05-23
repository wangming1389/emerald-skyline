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

import { handlePaymentRedirect } from "@/utils/payment-redirect";

describe("mobile payment flow gateway success callback", () => {
	it("routes a successful gateway callback to the mobile result screen", () => {
		mockedLinking.parse.mockReturnValueOnce({
			queryParams: {
				txnRef: "TXN-E2E",
				status: "success",
				amount: "250000",
				paymentMethod: "VNPAY",
			},
		});

		handlePaymentRedirect("emerald://payment/result?txnRef=TXN-E2E");

		expect(mockedRouter.replace).toHaveBeenCalledWith({
			pathname: "/payment/result",
			params: {
				txnRef: "TXN-E2E",
				status: "success",
				amount: "250000",
				paymentMethod: "VNPAY",
			},
		});
	});
});
