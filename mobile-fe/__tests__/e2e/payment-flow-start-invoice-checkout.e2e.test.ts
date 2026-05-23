import { describe, expect, it, vi } from "vitest";

const { mockedApi } = vi.hoisted(() => ({
	mockedApi: {
		post: vi.fn(),
	},
}));

vi.mock("@/services/api", () => ({
	api: mockedApi,
}));

import { createPayment } from "@/services/payment.service";

describe("mobile payment flow invoice checkout", () => {
	it("starts an invoice checkout with mobile deep-link metadata", async () => {
		const checkout = {
			id: 10,
			txnRef: "TXN-INVOICE",
			paymentUrl: "https://gateway.example/checkout",
			amount: 250000,
			paymentMethod: "VNPAY",
			status: "PENDING",
			createdAt: "2026-05-24T00:00:00.000Z",
		};
		mockedApi.post.mockResolvedValueOnce({ data: { data: checkout } });

		const result = await createPayment({
			targetType: "INVOICE",
			targetId: 77,
			paymentMethod: "VNPAY",
			deviceType: "mobile",
			redirectUrl: "emerald://payment/result",
		});

		expect(mockedApi.post).toHaveBeenCalledWith("/payments", {
			targetType: "INVOICE",
			targetId: 77,
			paymentMethod: "VNPAY",
			deviceType: "mobile",
			redirectUrl: "emerald://payment/result",
		});
		expect(result).toEqual(checkout);
	});
});
