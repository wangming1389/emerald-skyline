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

test.describe("Blocks Management (Quản lý tòa nhà)", () => {
	let mockBlocks: any[] = [];

	test.beforeEach(async ({ page }) => {
		// Reset mock data before each test
		mockBlocks = [
			{
				id: 1,
				buildingName: "Tòa A",
				managerName: "Nguyễn Văn A",
				managerPhone: "0987654321",
				status: "OPERATING",
				totalFloors: 10,
				totalRooms: 40,
				roomDetails: {
					studio: 10,
					oneBedroom: 10,
					twoBedroom: 10,
					penthouse: 10,
				},
			},
			{
				id: 2,
				buildingName: "Tòa B",
				managerName: "Trần Thị B",
				managerPhone: "0912345678",
				status: "UNDER_MAINTENANCE",
				totalFloors: 5,
				totalRooms: 20,
				roomDetails: {
					studio: 5,
					oneBedroom: 5,
					twoBedroom: 5,
					penthouse: 5,
				},
			},
		];

		// Seed authentication as ADMIN
		await seedAuthUser(page, "ADMIN");

		// Route GET and POST blocks
		await page.route("**/api/blocks", async (route) => {
			const method = route.request().method();
			if (method === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						success: true,
						data: mockBlocks,
					}),
				});
			} else if (method === "POST") {
				const postData = JSON.parse(route.request().postData() || "{}");
				const newBlock = {
					id: Date.now(), // Generate a unique ID
					buildingName: postData.buildingName,
					managerName: postData.managerName,
					managerPhone: postData.managerPhone,
					status: postData.status,
					totalFloors: postData.apartments?.length
						? Math.max(...postData.apartments.map((a: any) => a.floor))
						: 1,
					totalRooms: postData.apartments?.length || 0,
					roomDetails: {
						studio:
							postData.apartments?.filter((a: any) => a.type === "STUDIO")
								.length || 0,
						oneBedroom:
							postData.apartments?.filter((a: any) => a.type === "ONE_BEDROOM")
								.length || 0,
						twoBedroom:
							postData.apartments?.filter((a: any) => a.type === "TWO_BEDROOM")
								.length || 0,
						penthouse:
							postData.apartments?.filter((a: any) => a.type === "PENTHOUSE")
								.length || 0,
					},
				};
				mockBlocks.push(newBlock);
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						success: true,
						data: newBlock,
					}),
				});
			}
		});

		// Route specific block requests (GET details, has-residents check, and DELETE)
		await page.route("**/api/blocks/*", async (route) => {
			const url = route.request().url();
			const method = route.request().method();
			const idMatch = url.match(/\/blocks\/(\d+)/);
			const id = idMatch ? parseInt(idMatch[1], 10) : null;

			if (method === "GET") {
				if (url.endsWith("/has-residents")) {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							success: true,
							data: { hasResidents: false },
						}),
					});
				} else if (id) {
					const block = mockBlocks.find((b) => b.id === id);
					if (block) {
						// Create dummy apartments inside block detail
						const apartments = Array.from({ length: block.totalRooms }).map(
							(_, index) => ({
								id: 100 + index,
								roomName: `${block.buildingName}-${Math.ceil((index + 1) / 4)
									.toString()
									.padStart(
										2,
										"0",
									)}.${((index % 4) + 1).toString().padStart(2, "0")}`,
								type: "STUDIO",
								area: "50",
								floor: Math.ceil((index + 1) / 4),
								hasResidents: false,
							}),
						);

						await route.fulfill({
							status: 200,
							contentType: "application/json",
							body: JSON.stringify({
								success: true,
								data: {
									...block,
									apartments,
								},
							}),
						});
					} else {
						await route.fulfill({
							status: 404,
							contentType: "application/json",
							body: JSON.stringify({
								success: false,
								message: "Block not found",
							}),
						});
					}
				}
			} else if (method === "DELETE") {
				if (id) {
					const index = mockBlocks.findIndex((b) => b.id === id);
					if (index !== -1) {
						const deletedBlock = mockBlocks.splice(index, 1)[0];
						await route.fulfill({
							status: 200,
							contentType: "application/json",
							body: JSON.stringify({
								success: true,
								data: deletedBlock,
							}),
						});
						return;
					}
				}
				await route.fulfill({
					status: 404,
					contentType: "application/json",
					body: JSON.stringify({ success: false, message: "Block not found" }),
				});
			}
		});
	});

	test("displays blocks list successfully", async ({ page }) => {
		await page.goto("/blocks");
		await expect(page).toHaveURL(/\/blocks$/);

		// Verify page title and subtitle
		await expect(page.getByRole("heading", { name: "Tòa nhà" })).toBeVisible();
		await expect(
			page.getByText("Quản lý danh sách các tòa của chung cư"),
		).toBeVisible();

		// Verify existing block cards are rendered
		await expect(page.getByRole("heading", { name: "Tòa A" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Tòa B" })).toBeVisible();

		// Verify detailed stats are shown on cards
		await expect(page.getByText("Nguyễn Văn A")).toBeVisible();
		await expect(page.getByText("Trần Thị B")).toBeVisible();
	});

	test("navigates to block details and displays apartment matrix", async ({
		page,
	}) => {
		await page.goto("/blocks");

		// Click on a block title to view details
		await page.getByRole("heading", { name: "Tòa A" }).click();
		await expect(page).toHaveURL(/\/blocks\/1$/);

		// Verify detail page elements
		await expect(page.getByRole("heading", { name: "Tòa A" })).toBeVisible();
		await expect(page.getByText("Tên quản lý")).toBeVisible();
		await expect(page.getByText("Nguyễn Văn A")).toBeVisible();

		// Verify the apartment matrix or components inside detail block
		await expect(page.getByText("Chọn loại phòng")).toBeVisible();
		await expect(page.getByText("Tổng số phòng")).toBeVisible();
	});

	test("creates a new block through the multi-step form", async ({ page }) => {
		await page.goto("/blocks");

		// Click "Tạo tòa" button
		await page.getByRole("button", { name: "Tạo tòa" }).click();
		await expect(page).toHaveURL(/\/blocks\/create$/);

		// Step 1: Fill in Block details
		await page.getByPlaceholder("Nhập tên khối nhà").fill("Tòa C");

		// Select Status (combobox)
		await page.getByText("Chọn trạng thái").click();
		await page.getByRole("option", { name: "Hoạt động" }).click();

		await page.getByPlaceholder("Nhập tên quản lý").fill("Nguyễn Văn C");
		await page
			.getByPlaceholder("Nhập số điện thoại quản lý")
			.fill("0987111222");

		await page.getByPlaceholder("Nhập tổng số tầng").fill("3");
		await page.getByPlaceholder("Nhập diện tích mỗi căn hộ").fill("50");
		await page.getByPlaceholder("Nhập số căn hộ mỗi tầng").fill("2");

		// Select Apartment Type
		await page.getByText("Chọn loại căn hộ").click();
		await page.getByRole("option", { name: "Studio" }).click();

		// Go to Step 2
		await page.getByRole("button", { name: "Tiếp theo" }).click();

		// Verify Step 2 (Apartment Matrix) is displayed
		await expect(page.getByText("Thêm tầng")).toBeVisible();
		await expect(page.getByText("Tòa C-01.01")).toBeVisible(); // Default code pattern built in generateApartments

		// Go to Step 3
		await page.getByRole("button", { name: "Tiếp theo" }).click();

		// Verify Step 3 (Summary Card)
		await expect(page.getByRole("heading", { name: "Tòa C" })).toBeVisible();
		await expect(page.getByText("Căn hộ studio")).toBeVisible();

		// Click submit block
		await page.getByRole("button", { name: "Thêm tòa" }).click();

		// Verify redirect to blocks list
		await expect(page).toHaveURL(/\/blocks$/);

		// Verify the newly created block card is shown on the list page
		await expect(page.getByRole("heading", { name: "Tòa C" })).toBeVisible();
		await expect(page.getByText("Nguyễn Văn C")).toBeVisible();
	});

	test("deletes a block successfully", async ({ page }) => {
		await page.goto("/blocks");

		// Click the delete button of Tòa A (first card)
		const blockACard = page
			.locator("div.border")
			.filter({ has: page.getByRole("heading", { name: "Tòa A" }) });
		await blockACard.getByRole("button").nth(1).click(); // Edit is index 0, Delete is index 1

		// Verify delete modal dialog is opened
		await expect(page.getByText("Xác nhận xóa")).toBeVisible();
		await expect(
			page.getByText('Bạn có chắc chắn muốn xóa khối nhà "Tòa A" không?'),
		).toBeVisible();

		// Click delete confirmation button
		await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

		// Verify the deleted block card is no longer visible
		await expect(
			page.getByRole("heading", { name: "Tòa A" }),
		).not.toBeVisible();
		await expect(page.getByRole("heading", { name: "Tòa B" })).toBeVisible();
	});
});
