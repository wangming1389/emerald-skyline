import { describe, expect, it, vi } from "vitest";

const { mockedApi } = vi.hoisted(() => ({
	mockedApi: {
		post: vi.fn(),
	},
}));

vi.mock("@/services/api", () => ({
	api: mockedApi,
}));

import { createBatchPayment } from "@/services/payment.service";

describe("mobile payment flow batch checkout", () => {
	it("starts a batch checkout for multiple invoice targets", async () => {
		const checkout = {
			id: 11,
			txnRef: "TXN-BATCH",
			paymentUrl: "https://gateway.example/batch",
			amount: 450000,
			paymentMethod: "MOMO",
			status: "PENDING",
			createdAt: "2026-05-24T00:00:00.000Z",
			batchIds: [77, 78],
			itemCount: 2,
		};
		mockedApi.post.mockResolvedValueOnce({ data: { data: checkout } });

		const result = await createBatchPayment({
			targetType: "INVOICE",
			targetIds: [77, 78],
			paymentMethod: "MOMO",
			deviceType: "mobile",
		});

		expect(mockedApi.post).toHaveBeenCalledWith("/payments/batch", {
			targetType: "INVOICE",
			targetIds: [77, 78],
			paymentMethod: "MOMO",
			deviceType: "mobile",
		});
		expect(result).toEqual(checkout);
	});
});
