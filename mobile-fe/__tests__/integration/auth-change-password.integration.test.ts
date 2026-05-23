import { describe, expect, it, vi } from "vitest";

const { mockedApi } = vi.hoisted(() => ({
	mockedApi: {
		post: vi.fn(),
	},
}));

vi.mock("@/services/api", () => ({
	api: mockedApi,
}));

import { changePassword } from "@/services/auth";

describe("auth change password integration", () => {
	it("posts change password payload", async () => {
		mockedApi.post.mockResolvedValueOnce({ data: { data: { ok: true } } });

		const result = await changePassword({
			oldPassword: "old-pass",
			newPassword: "new-pass",
		});

		expect(mockedApi.post).toHaveBeenCalledWith("/auth/change-password", {
			oldPassword: "old-pass",
			newPassword: "new-pass",
		});
		expect(result).toEqual({ ok: true });
	});
});
