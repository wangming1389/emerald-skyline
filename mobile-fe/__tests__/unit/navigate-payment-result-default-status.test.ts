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

import { navigateToPaymentResult } from "@/utils/payment-redirect";

describe("navigateToPaymentResult default status", () => {
	it("navigates to the payment result screen with safe defaults", () => {
		navigateToPaymentResult({
			txnRef: "TXN-003",
			amount: "99000",
			paymentMethod: "MOMO",
		});

		expect(mockedRouter.replace).toHaveBeenCalledWith({
			pathname: "/payment/result",
			params: {
				txnRef: "TXN-003",
				status: "success",
				amount: "99000",
				paymentMethod: "MOMO",
			},
		});
	});
});
