import { describe, expect, it, vi } from "vitest";

const { mockedApi } = vi.hoisted(() => ({
	mockedApi: {
		post: vi.fn(),
	},
}));

vi.mock("@/services/api", () => ({
	api: mockedApi,
}));

import { logout } from "@/services/auth";

describe("auth logout integration", () => {
	it("calls logout endpoint", async () => {
		mockedApi.post.mockResolvedValueOnce({ data: {} });

		await logout();

		expect(mockedApi.post).toHaveBeenCalledWith("/auth/logout");
	});
});
