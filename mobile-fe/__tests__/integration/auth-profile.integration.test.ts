import { describe, expect, it, vi } from "vitest";

const { mockedApi } = vi.hoisted(() => ({
	mockedApi: {
		get: vi.fn(),
	},
}));

vi.mock("@/services/api", () => ({
	api: mockedApi,
}));

import { getProfile } from "@/services/auth";

describe("auth profile integration", () => {
	it("fetches profile from /auth/profile", async () => {
		const profile = {
			id: "u1",
			email: "resident@example.com",
			fullName: "Resident One",
		};
		mockedApi.get.mockResolvedValueOnce({ data: { data: profile } });

		const result = await getProfile();

		expect(mockedApi.get).toHaveBeenCalledWith("/auth/profile");
		expect(result).toEqual(profile);
	});
});
