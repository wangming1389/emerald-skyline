import { expect, type Page, test } from "@playwright/test";

const makeAuthUser = (
	role: "ADMIN" | "TECHNICIAN",
	options?: { id?: number; email?: string },
) => {
	const id = options?.id ?? 1;
	const email =
		options?.email ??
		(role === "ADMIN" ? "admin@example.com" : "tech@example.com");

	return {
		id,
		email,
		role,
		isActive: true,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
};

const seedAuthUser = async (
	page: Page,
	role: "ADMIN" | "TECHNICIAN",
	options?: { id?: number; email?: string },
) => {
	const user = makeAuthUser(role, options);

	await page.addInitScript((payload) => {
		localStorage.setItem("auth_user", JSON.stringify(payload));
	}, user);
};

test.describe("Residents Management (Quản lý cư dân)", () => {
	let mockResidents: any[] = [];

	test.beforeEach(async ({ page }) => {
		// Mock local storage auth user
		await seedAuthUser(page, "ADMIN");

		// Initialize mock data
		mockResidents = [
			{
				id: 1,
				fullName: "Nguyễn Văn Cư Dân",
				citizenId: "123456789012",
				dob: "1990-01-01T00:00:00.000Z",
				gender: "MALE",
				phoneNumber: "0987654321",
				nationality: "Việt Nam",
				ward: "Phường Bến Nghé",
				province: "Thành phố Hồ Chí Minh",
				detailAddress: "123 Nguyễn Du",
				account: {
					email: "cudan1@example.com",
				},
				residences: [],
			},
		];

		// Log failed requests and console errors for easy debugging
		page.on("requestfailed", (request) => {
			console.log(
				`REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`,
			);
		});
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				console.log(`PAGE CONSOLE ERROR: ${msg.text()}`);
			}
		});

		// Mock Provinces API (open-api.vn)
		await page.route(
			"https://provinces.open-api.vn/api/v2/p/",
			async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					headers: { "Access-Control-Allow-Origin": "*" },
					body: JSON.stringify([
						{ code: 79, name: "Thành phố Hồ Chí Minh" },
						{ code: 1, name: "Thành phố Hà Nội" },
					]),
				});
			},
		);

		await page.route(
			"https://provinces.open-api.vn/api/v2/p/79?depth=2",
			async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					headers: { "Access-Control-Allow-Origin": "*" },
					body: JSON.stringify({
						code: 79,
						name: "Thành phố Hồ Chí Minh",
						wards: [
							{ code: 27082, name: "Phường Bến Nghé" },
							{ code: 27085, name: "Phường Bến Thành" },
						],
					}),
				});
			},
		);

		// Route all API requests globally, handling CORS preflight
		await page.route("**/api/**", async (route) => {
			const method = route.request().method();
			const url = route.request().url();

			if (method === "OPTIONS") {
				await route.fulfill({
					status: 200,
					headers: {
						"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
						"Access-Control-Allow-Credentials": "true",
						"Access-Control-Allow-Methods":
							"GET, POST, PATCH, PUT, DELETE, OPTIONS",
						"Access-Control-Allow-Headers": "Content-Type, Authorization",
					},
				});
				return;
			}

			// GET & POST **/api/v1/residents
			if (
				url.includes("/residents") &&
				!url.includes("/invoices") &&
				!url.includes("/apartments") &&
				!/\/residents\/\d+/.test(url)
			) {
				if (method === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						headers: {
							"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
							"Access-Control-Allow-Credentials": "true",
						},
						body: JSON.stringify({
							success: true,
							data: mockResidents,
						}),
					});
				} else if (method === "POST") {
					const newResident = {
						id: Date.now(),
						fullName: "Trần Thị Cư Dân",
						citizenId: "987654321098",
						dob: "1995-05-15T00:00:00.000Z",
						gender: "FEMALE",
						phoneNumber: "0912345678",
						nationality: "Việt Nam",
						ward: "Phường Bến Thành",
						province: "Thành phố Hồ Chí Minh",
						detailAddress: "456 Lê Lợi",
						account: {
							email: "cudan2@example.com",
						},
						residences: [],
					};
					mockResidents.push(newResident);
					await route.fulfill({
						status: 201,
						contentType: "application/json",
						headers: {
							"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
							"Access-Control-Allow-Credentials": "true",
						},
						body: JSON.stringify({
							success: true,
							data: newResident,
						}),
					});
				}
				return;
			}

			// GET **/api/residents/:id/invoices, **/api/admin/residents/:id/invoices, **/api/residents/:id/apartments
			if (url.includes("/invoices") || url.includes("/apartments")) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					headers: {
						"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
						"Access-Control-Allow-Credentials": "true",
					},
					body: JSON.stringify({
						success: true,
						invoices: [],
						payments: [],
						data: {
							residences: [],
						},
					}),
				});
				return;
			}

			// GET **/api/v1/system-notifications/my-notifications
			if (url.includes("/system-notifications")) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					headers: {
						"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
						"Access-Control-Allow-Credentials": "true",
					},
					body: JSON.stringify({
						success: true,
						data: [],
					}),
				});
				return;
			}

			// GET & DELETE **/api/residents/:id
			const residentIdMatch = url.match(/\/residents\/(\d+)/);
			if (residentIdMatch) {
				const id = parseInt(residentIdMatch[1], 10);
				if (method === "GET") {
					const resident = mockResidents.find((r) => r.id === id);
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						headers: {
							"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
							"Access-Control-Allow-Credentials": "true",
						},
						body: JSON.stringify({
							success: true,
							data: resident || null,
						}),
					});
				} else if (method === "DELETE") {
					const index = mockResidents.findIndex((r) => r.id === id);
					if (index !== -1) {
						mockResidents.splice(index, 1);
						await route.fulfill({
							status: 200,
							contentType: "application/json",
							headers: {
								"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
								"Access-Control-Allow-Credentials": "true",
							},
							body: JSON.stringify({
								success: true,
								message: "Xóa cư dân thành công",
							}),
						});
					} else {
						await route.fulfill({
							status: 404,
							contentType: "application/json",
							headers: {
								"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
								"Access-Control-Allow-Credentials": "true",
							},
							body: JSON.stringify({
								success: false,
								message: "Resident not found",
							}),
						});
					}
				}
				return;
			}

			// Fallback/continue
			await route.continue();
		});
	});

	test("displays residents list successfully", async ({ page }) => {
		await page.goto("/residents");
		await expect(page).toHaveURL(/\/residents$/);

		// Verify page title
		await expect(page.getByRole("heading", { name: "Cư dân" })).toBeVisible();

		// Verify table columns and data rows
		await expect(
			page.getByRole("cell", { name: "Nguyễn Văn Cư Dân" }),
		).toBeVisible();
		await expect(
			page.getByRole("cell", { name: "cudan1@example.com" }),
		).toBeVisible();
		await expect(page.getByRole("cell", { name: "0987654321" })).toBeVisible();
	});

	test("navigates to resident details page", async ({ page }) => {
		await page.goto("/residents");

		// Locate the row for Nguyễn Văn Cư Dân and click 'Xem' (View) button
		const row = page.locator("tr").filter({ hasText: "Nguyễn Văn Cư Dân" });
		await row.getByTitle("Xem").click();

		await expect(page).toHaveURL(/\/residents\/1$/);

		// Verify that resident details are loaded and visible
		await expect(page.getByText("Thông tin cá nhân")).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Nguyễn Văn Cư Dân" }).first(),
		).toBeVisible();
		await expect(page.getByText("123456789012")).toBeVisible();
		await expect(page.getByText("cudan1@example.com").first()).toBeVisible();
	});

	test("creates a new resident successfully", async ({ page }) => {
		await page.goto("/residents");

		// Click "Tạo cư dân" button
		await page.getByRole("button", { name: "Tạo cư dân" }).click();

		// Fill in Create Resident Modal details
		await page.getByPlaceholder("Nhập email").fill("cudan2@example.com");
		await page.getByPlaceholder("Nhập họ và tên").fill("Trần Thị Cư Dân");
		await page.getByPlaceholder("Nhập số CCCD").fill("987654321098");

		// Click Date of Birth selector and select 15th
		await page.getByRole("button", { name: "dd/MM/yyyy" }).click();
		await page.getByRole("gridcell", { name: "15" }).first().click();

		// Select Gender
		await page.getByText("Chọn giới tính").click();
		await page.getByRole("option", { name: "Nữ" }).click();

		await page.getByPlaceholder("Nhập số điện thoại").fill("0912345678");

		// Select Province
		await page.getByText("Chọn tỉnh").click();
		await page.getByRole("option", { name: "Thành phố Hồ Chí Minh" }).click();

		// Select Ward
		await page.getByText("Chọn phường / xã").click();
		await page.getByRole("option", { name: "Phường Bến Thành" }).click();

		await page.getByPlaceholder("Nhập địa chỉ chi tiết").fill("456 Lê Lợi");

		// Click "Tạo mới" submit button
		await page.getByRole("button", { name: "Tạo mới" }).click();

		// Verify modal closes and new resident card/row is added to list page
		await expect(
			page.getByRole("cell", { name: "Trần Thị Cư Dân" }),
		).toBeVisible();
		await expect(
			page.getByRole("cell", { name: "cudan2@example.com" }),
		).toBeVisible();
	});

	test("deletes a resident successfully", async ({ page }) => {
		await page.goto("/residents");

		// Locate row and click 'Xóa' (Delete)
		const row = page.locator("tr").filter({ hasText: "Nguyễn Văn Cư Dân" });
		await row.getByTitle("Xóa").click();

		// Verify delete modal PopConfirm
		await expect(page.getByText("Xác nhận xóa")).toBeVisible();
		await expect(
			page.getByText(
				'Bạn có chắc chắn muốn xóa cư dân "Nguyễn Văn Cư Dân" không?',
			),
		).toBeVisible();

		// Click confirm button 'Tiếp tục'
		await page.getByRole("button", { name: "Tiếp tục" }).click();

		// Verify resident row is removed
		await expect(
			page.getByRole("cell", { name: "Nguyễn Văn Cư Dân" }),
		).not.toBeVisible();
	});
});
