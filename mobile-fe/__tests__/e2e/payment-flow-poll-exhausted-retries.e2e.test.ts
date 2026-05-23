import { describe, expect, it, vi } from "vitest";

const { mockedApi } = vi.hoisted(() => ({
	mockedApi: {
		get: vi.fn(),
	},
}));

vi.mock("@/services/api", () => ({
	api: mockedApi,
}));

import { pollPaymentStatus } from "@/services/payment.service";

const paymentStatus = (status: "PENDING" | "FAILED") => ({
	id: 1,
	txnRef: "TXN-E2E",
	targetType: "INVOICE",
	targetId: 77,
	amount: "250000",
	paymentMethod: "VNPAY",
	status,
	description: "Resident invoice payment",
	payDate: status === "PENDING" ? null : "2026-05-24T00:00:00.000Z",
	paymentUrl: null,
	createdAt: "2026-05-24T00:00:00.000Z",
});

describe("mobile payment flow polling exhausted retries", () => {
	it("returns the final gateway state when polling exhausts retries", async () => {
		mockedApi.get
			.mockResolvedValueOnce({ data: { data: paymentStatus("PENDING") } })
			.mockResolvedValueOnce({ data: { data: paymentStatus("FAILED") } });

		await expect(pollPaymentStatus("TXN-E2E", 1, 1000)).resolves.toMatchObject({
			txnRef: "TXN-E2E",
			status: "FAILED",
		});
		expect(mockedApi.get).toHaveBeenCalledTimes(2);
	});
});
