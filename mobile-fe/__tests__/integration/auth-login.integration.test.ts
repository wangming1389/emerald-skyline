import { describe, expect, it, vi } from "vitest";

const { mockedApi } = vi.hoisted(() => ({
	mockedApi: {
		post: vi.fn(),
	},
}));

vi.mock("@/services/api", () => ({
	api: mockedApi,
}));

import { login } from "@/services/auth";

describe("auth login integration", () => {
	it("posts login payload and returns auth response", async () => {
		const payload = {
			accessToken: "access-token",
			refreshToken: "refresh-token",
			user: { id: "u1", email: "resident@example.com" },
		};
		mockedApi.post.mockResolvedValueOnce({ data: { data: payload } });

		const result = await login("resident@example.com", "secret");

		expect(mockedApi.post).toHaveBeenCalledWith("/auth/login", {
			email: "resident@example.com",
			password: "secret",
		});
		expect(result).toEqual(payload);
	});
});
