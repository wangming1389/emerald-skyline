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

const paymentStatus = (status: "PENDING" | "SUCCESS") => ({
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

describe("mobile payment flow polling success", () => {
	it("polls until the gateway marks a payment successful", async () => {
		vi.useFakeTimers();
		mockedApi.get
			.mockResolvedValueOnce({ data: { data: paymentStatus("PENDING") } })
			.mockResolvedValueOnce({ data: { data: paymentStatus("SUCCESS") } });

		const resultPromise = pollPaymentStatus("TXN-E2E", 2, 1000);
		await vi.advanceTimersByTimeAsync(1000);

		await expect(resultPromise).resolves.toMatchObject({
			txnRef: "TXN-E2E",
			status: "SUCCESS",
		});
		expect(mockedApi.get).toHaveBeenCalledTimes(2);
		expect(mockedApi.get).toHaveBeenNthCalledWith(
			1,
			"/payments/txn-ref/TXN-E2E",
		);
		vi.useRealTimers();
	});
});
