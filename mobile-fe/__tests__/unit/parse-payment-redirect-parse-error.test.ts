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

describe("parsePaymentRedirectUrl parse error", () => {
	it("returns null when Expo Linking cannot parse the URL", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		mockedLinking.parse.mockImplementationOnce(() => {
			throw new Error("bad url");
		});

		expect(parsePaymentRedirectUrl("not-a-url")).toBeNull();
		expect(errorSpy).toHaveBeenCalledWith(
			"[PaymentRedirect] Error parsing URL:",
			expect.any(Error),
		);
	});
});
