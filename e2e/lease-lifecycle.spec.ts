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

test.describe("Lease Lifecycle E2E Flow (Vòng đời thuê nhà)", () => {
	let mockResidents: any[] = [];
	let mockApartments: any[] = [];
	let mockInvoices: any[] = [];

	test.beforeEach(async ({ page }) => {
		// Reset mock databases
		mockResidents = [
			{
				id: 1,
				fullName: "Nguyễn Văn Cư Dân",
				citizenId: "123456789012",
				dob: "1990-01-01T00:00:00.000Z",
				gender: "MALE",
				phoneNumber: "0987654321",
				nationality: "Kinh",
				province: "Thành phố Hồ Chí Minh",
				ward: "Phường Bến Thành",
				detailAddress: "123 Hàng Đào",
				imageUrl: null,
				isActive: true,
				account: {
					id: 2,
					email: "cudan1@example.com",
					role: "RESIDENT",
					isActive: true,
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		];

		mockApartments = [
			{
				id: 99,
				roomName: "B.05-02",
				type: "STUDIO",
				block: "Tòa B",
				floor: 5,
				area: "40",
				owner: "Trần Thị B",
				status: "OCCUPIED",
			},
		];

		mockInvoices = [];

		await seedAuthUser(page, "ADMIN");

		// Request logger and console printer for debugging
		page.on("requestfailed", (request) => {
			console.log(
				`REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`,
			);
		});
		page.on("console", (msg) => {
			console.log(`PAGE CONSOLE [${msg.type()}]: ${msg.text()}`);
		});

		// Setup dynamically responding API routes
		await page.route("**/api/**", async (route) => {
			const method = route.request().method();
			const url = route.request().url();
			console.log(`[Mock API] Request: ${method} ${url}`);

			// Handle OPTIONS Preflight
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

			// GET /blocks
			if (url.includes("/blocks")) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					headers: {
						"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
						"Access-Control-Allow-Credentials": "true",
					},
					body: JSON.stringify({
						success: true,
						data: [
							{
								id: 1,
								buildingName: "Tòa A",
								totalFloors: 10,
								totalRooms: 40,
							},
							{
								id: 2,
								buildingName: "Tòa B",
								totalFloors: 10,
								totalRooms: 40,
							},
						],
					}),
				});
				return;
			}

			// GET & POST /residents
			if (url.includes("/residents") && !/\/residents\/\d+/.test(url)) {
				if (method === "GET") {
					console.log(
						`[Mock API debug] GET /residents called. Returning:`,
						JSON.stringify(mockResidents),
					);
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
					const bodyText = route.request().postData() || "";
					console.log(
						`[Mock API debug] POST /residents called. BodyText:`,
						bodyText,
					);

					const nameMatch = bodyText.match(
						/name="fullName"[\r\n]+([\s\S]*?)(?=--|$)/,
					);
					const emailMatch = bodyText.match(
						/name="email"[\r\n]+([\s\S]*?)(?=--|$)/,
					);
					const phoneMatch = bodyText.match(
						/name="phoneNumber"[\r\n]+([\s\S]*?)(?=--|$)/,
					);
					const citizenIdMatch = bodyText.match(
						/name="citizenId"[\r\n]+([\s\S]*?)(?=--|$)/,
					);
					const provinceMatch = bodyText.match(
						/name="province"[\r\n]+([\s\S]*?)(?=--|$)/,
					);
					const wardMatch = bodyText.match(
						/name="ward"[\r\n]+([\s\S]*?)(?=--|$)/,
					);
					const dobMatch = bodyText.match(
						/name="dob"[\r\n]+([\s\S]*?)(?=--|$)/,
					);
					const genderMatch = bodyText.match(
						/name="gender"[\r\n]+([\s\S]*?)(?=--|$)/,
					);

					const fullName = nameMatch ? nameMatch[1].trim() : "Nguyễn Văn Thuê";
					const email = emailMatch
						? emailMatch[1].trim()
						: "nguyenvanthue@example.com";
					const phoneNumber = phoneMatch ? phoneMatch[1].trim() : "0987111222";
					const citizenId = citizenIdMatch
						? citizenIdMatch[1].trim()
						: "123456789012";
					const province = provinceMatch
						? provinceMatch[1].trim()
						: "Thành phố Hồ Chí Minh";
					const ward = wardMatch ? wardMatch[1].trim() : "Phường Bến Thành";
					const dob = dobMatch
						? dobMatch[1].trim()
						: "1995-05-15T00:00:00.000Z";
					const gender = genderMatch ? genderMatch[1].trim() : "MALE";

					const newResident = {
						id: 18,
						fullName,
						citizenId,
						dob,
						gender,
						phoneNumber,
						nationality: "Kinh",
						province,
						ward,
						detailAddress: "456 Lê Lợi",
						imageUrl: null,
						isActive: true,
						account: {
							id: 180,
							email,
							role: "RESIDENT",
							isActive: true,
							createdAt: "2026-01-01T00:00:00.000Z",
							updatedAt: "2026-01-01T00:00:00.000Z",
						},
						createdAt: "2026-05-24T00:00:00.000Z",
						updatedAt: "2026-05-24T00:00:00.000Z",
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

			// GET, PATCH & DELETE /residents/:id
			const residentIdMatch = url.match(/\/residents\/(\d+)/);
			if (
				residentIdMatch &&
				!url.includes("/apartments") &&
				!url.includes("/invoices")
			) {
				const id = parseInt(residentIdMatch[1], 10);
				if (method === "GET") {
					const resident = mockResidents.find((r) => r.id === id);
					if (resident) {
						await route.fulfill({
							status: 200,
							contentType: "application/json",
							headers: {
								"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
								"Access-Control-Allow-Credentials": "true",
							},
							body: JSON.stringify({
								success: true,
								data: resident,
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
				} else if (method === "DELETE") {
					mockResidents = mockResidents.filter((r) => r.id !== id);
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						headers: {
							"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
							"Access-Control-Allow-Credentials": "true",
						},
						body: JSON.stringify({
							success: true,
							message: "Deleted resident successfully",
						}),
					});
				}
				return;
			}

			// GET /residents/:id/apartments
			if (url.includes("/residents/") && url.includes("/apartments")) {
				const residentId = parseInt(
					url.match(/\/residents\/(\d+)/)?.[1] || "0",
					10,
				);
				const resident = mockResidents.find((r) => r.id === residentId);
				const residences = resident
					? mockApartments
							.filter((a) => a.owner === resident.fullName)
							.map((a) => ({
								id: a.id + 1000,
								apartmentId: a.id,
								apartment: {
									id: a.id,
									roomNumber: a.roomName,
									blockName: a.block,
									area: Number(a.area),
								},
								relationship: "OWNER",
							}))
					: [];

				await route.fulfill({
					status: 200,
					contentType: "application/json",
					headers: {
						"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
						"Access-Control-Allow-Credentials": "true",
					},
					body: JSON.stringify({
						success: true,
						residences,
					}),
				});
				return;
			}

			// GET /residents/:id/invoices or /admin/residents/:id/invoices
			if (url.includes("/residents/") && url.includes("/invoices")) {
				const residentId = parseInt(
					url.match(/\/residents\/(\d+)/)?.[1] || "0",
					10,
				);
				const resident = mockResidents.find((r) => r.id === residentId);
				const matchingInvoices = resident
					? mockInvoices.filter((inv) =>
							mockApartments.some(
								(a) =>
									a.id === inv.apartmentId && a.owner === resident.fullName,
							),
						)
					: [];

				await route.fulfill({
					status: 200,
					contentType: "application/json",
					headers: {
						"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
						"Access-Control-Allow-Credentials": "true",
					},
					body: JSON.stringify({
						invoices: matchingInvoices,
						payments: [],
					}),
				});
				return;
			}

			// GET & POST /apartments
			if (url.includes("/apartments") && !/\/apartments\/\d+/.test(url)) {
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
							data: mockApartments,
						}),
					});
				} else if (method === "POST") {
					const postData = JSON.parse(route.request().postData() || "{}");
					const ownerResident = mockResidents.find(
						(r) => r.id === postData.owner_id,
					);
					const ownerName = ownerResident
						? ownerResident.fullName
						: "Nguyễn Văn Thuê";

					const newApt = {
						id: 101,
						roomName: postData.roomName,
						type: postData.type,
						block: postData.blockId === 1 ? "Tòa A" : "Tòa A", // fallback to Tòa A
						floor: postData.floor,
						area: String(postData.area),
						owner: ownerName,
						status: "OCCUPIED",
					};

					mockApartments.push(newApt);

					await route.fulfill({
						status: 201,
						contentType: "application/json",
						headers: {
							"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
							"Access-Control-Allow-Credentials": "true",
						},
						body: JSON.stringify({
							success: true,
							data: newApt,
						}),
					});
				}
				return;
			}

			// GET, PATCH & DELETE /apartments/:id
			const apartmentIdMatch = url.match(/\/apartments\/(\d+)/);
			if (apartmentIdMatch) {
				const id = parseInt(apartmentIdMatch[1], 10);
				if (method === "GET") {
					const apt = mockApartments.find((a) => a.id === id);
					if (apt) {
						const residentObj = mockResidents.find(
							(r) => r.fullName === apt.owner,
						) || {
							id: 18,
							fullName: apt.owner,
							phoneNumber: "0987111222",
							citizenId: "123456789012",
						};

						await route.fulfill({
							status: 200,
							contentType: "application/json",
							headers: {
								"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
								"Access-Control-Allow-Credentials": "true",
							},
							body: JSON.stringify({
								success: true,
								data: {
									generalInfo: {
										ownerId: residentObj.id,
										blockId: 1,
										apartmentName: apt.roomName,
										building: apt.block,
										floor: apt.floor,
										area: apt.area,
										type: apt.type,
										status: apt.status,
									},
									owner: {
										fullName: residentObj.fullName,
										phone: residentObj.phoneNumber,
										identityCard: residentObj.citizenId,
									},
									residents: [
										{
											id: residentObj.id,
											fullName: residentObj.fullName,
											gender: "MALE",
											phone: residentObj.phoneNumber,
											identityCard: residentObj.citizenId,
											relationship: "OWNER",
										},
									],
								},
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
								message: "Apartment not found",
							}),
						});
					}
				} else if (method === "DELETE") {
					mockApartments = mockApartments.filter((a) => a.id !== id);
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						headers: {
							"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
							"Access-Control-Allow-Credentials": "true",
						},
						body: JSON.stringify({
							success: true,
							message: "Apartment deleted successfully",
						}),
					});
				}
				return;
			}

			// GET & POST /invoices
			if (url.includes("/invoices") && !/\/invoices\/\d+/.test(url)) {
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
							data: mockInvoices,
						}),
					});
				} else if (method === "POST" && url.includes("/admin")) {
					const postData = JSON.parse(route.request().postData() || "{}");
					const periodDate = new Date(postData.period);
					const month = String(periodDate.getMonth() + 1).padStart(2, "0");
					const year = periodDate.getFullYear();

					const newInvoice = {
						id: 501,
						invoiceCode: `INV-2026${month}-A101`,
						apartmentId: postData.apartmentId,
						period: postData.period,
						totalAmount: 1500000,
						status: "UNPAID", // PENDING/UNPAID
						dueDate: "2026-06-15T00:00:00.000Z",
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						invoiceDetails: [
							{
								id: 901,
								feeTypeName: "Tiền nước",
								amount: postData.waterIndex,
								totalPrice: 300000,
							},
							{
								id: 902,
								feeTypeName: "Tiền điện",
								amount: postData.electricityIndex,
								totalPrice: 1200000,
							},
						],
					};

					mockInvoices.push(newInvoice);

					await route.fulfill({
						status: 201,
						contentType: "application/json",
						headers: {
							"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
							"Access-Control-Allow-Credentials": "true",
						},
						body: JSON.stringify({
							success: true,
							data: newInvoice,
						}),
					});
				}
				return;
			}

			// GET /invoices/:id
			const invoiceIdMatch = url.match(/\/invoices\/(\d+)/);
			if (invoiceIdMatch) {
				const id = parseInt(invoiceIdMatch[1], 10);
				const inv = mockInvoices.find((i) => i.id === id);
				if (inv) {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						headers: {
							"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
							"Access-Control-Allow-Credentials": "true",
						},
						body: JSON.stringify({
							success: true,
							data: inv,
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
							message: "Invoice not found",
						}),
					});
				}
				return;
			}

			// GET /system-notifications/my-notifications
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

			// Fallback/continue
			await route.continue();
		});
	});

	test("executes complete lease lifecycle (Vòng đời thuê nhà)", async ({
		page,
	}) => {
		// ==========================================
		// 1. Resident Onboarding: Thêm cư dân mới
		// ==========================================
		await page.goto("/residents");
		await expect(page).toHaveURL(/\/residents$/);

		// Nhấp "Tạo cư dân"
		await page.getByRole("button", { name: "Tạo cư dân" }).click();

		// Điền thông tin cư dân
		await page.getByPlaceholder("Nhập email").fill("nguyenvanthue@example.com");
		await page.getByPlaceholder("Nhập họ và tên").fill("Nguyễn Văn Thuê");
		await page.getByPlaceholder("Nhập số CCCD").fill("123456789012");

		// Chọn ngày sinh
		await page.getByRole("button", { name: "dd/MM/yyyy" }).click();
		await page.getByRole("gridcell", { name: "15" }).first().click();

		// Chọn giới tính
		await page.getByText("Chọn giới tính").click();
		await page.getByRole("option", { name: "Nam" }).click();

		await page.getByPlaceholder("Nhập số điện thoại").fill("0987111222");

		// Địa chỉ
		await page.getByText("Chọn tỉnh").click();
		await page.getByRole("option", { name: "Thành phố Hồ Chí Minh" }).click();

		await page.getByText("Chọn phường / xã").click();
		await page.getByRole("option", { name: "Phường Bến Thành" }).click();

		await page.getByPlaceholder("Nhập địa chỉ chi tiết").fill("456 Lê Lợi");

		// Submit tạo cư dân
		await page.getByRole("button", { name: "Tạo mới" }).click();

		// Verify cư dân mới hiển thị trong bảng
		await expect(
			page.getByRole("cell", { name: "Nguyễn Văn Thuê" }),
		).toBeVisible();
		await expect(
			page.getByRole("cell", { name: "nguyenvanthue@example.com" }),
		).toBeVisible();

		// ==========================================
		// 2. Assign to Apartment: Tạo Căn hộ mới & Gán Nguyễn Văn Thuê làm Chủ hộ
		// ==========================================
		await page.goto("/apartments");
		await expect(page).toHaveURL(/\/apartments$/);

		// Nhấp "Tạo căn hộ"
		await page.getByRole("button", { name: "Tạo căn hộ" }).click();

		// Điền thông tin căn hộ
		await page.getByPlaceholder("Nhập mã căn hộ (VD: A.12-01)").fill("A.10-15");

		// Chọn loại căn hộ
		await page.getByText("Chọn loại căn hộ").click();
		await page.getByRole("option", { name: "1 Phòng ngủ" }).click();

		// Chọn tòa nhà
		await page.getByText("Chọn tòa").click();
		await page.getByRole("option", { name: "Tòa A" }).click();

		// Chọn tầng
		await page.getByText("Chọn tầng").click();
		await page.getByRole("option", { name: "Tầng 10" }).click();

		// Nhập diện tích
		await page.getByPlaceholder("Nhập diện tích").fill("50");

		// Chọn chủ hộ qua Combobox
		await page.getByText("Chọn chủ hộ").first().click();
		await page.getByPlaceholder("Tìm chủ hộ...").fill("123456789012");
		await page.getByText("Nguyễn Văn Thuê - 123456789012").first().click();

		// Submit tạo căn hộ
		await page.getByRole("button", { name: "Tạo mới" }).click();

		// Verify căn hộ được hiển thị trong bảng danh sách
		await expect(page.getByRole("cell", { name: "A.10-15" })).toBeVisible();
		await expect(
			page.getByRole("cell", { name: "Nguyễn Văn Thuê" }),
		).toBeVisible();

		// Điều hướng tới trang chi tiết căn hộ
		const aptRow = page.locator("tr").filter({ hasText: "A.10-15" }).first();
		await aptRow.getByTitle("Xem").first().click({ force: true });
		await expect(page).toHaveURL(/\/apartments\/101$/);

		// Xác nhận thông tin chi tiết căn hộ
		await expect(page.getByText("A.10-15").first()).toBeVisible();
		await expect(page.getByText("Nguyễn Văn Thuê").first()).toBeVisible();
		await expect(page.getByText("0987111222").first()).toBeVisible();

		// ==========================================
		// 3. Invoicing: Tạo Hóa đơn hàng tháng
		// ==========================================
		await page.goto("/invoices");
		await expect(page).toHaveURL(/\/invoices$/);

		// Click tạo hóa đơn
		await page.getByRole("button", { name: "Tạo hóa đơn" }).click();

		// Chọn căn hộ qua Combobox
		await page.getByText("Chọn căn hộ").first().click();
		await page.getByPlaceholder("Tìm căn hộ...").fill("A.10-15");
		await page.getByText("A.10-15 - Tòa A").first().click();

		// Chọn kỳ thanh toán
		await page.getByText("MM/yyyy").first().click();
		await page.getByRole("gridcell", { name: "15" }).first().click();

		// Điền các chỉ số điện/nước
		await page.getByPlaceholder("Nhập chỉ số nước").fill("150");
		await page.getByPlaceholder("Nhập chỉ số điện").fill("300");

		// Submit tạo hóa đơn
		await page.getByRole("button", { name: "Tạo mới" }).click();

		// Verify hóa đơn mới được hiển thị trong danh sách ở trạng thái Chưa thanh toán
		await expect(
			page.getByRole("cell", { name: "101", exact: true }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("cell", { name: "Chưa thanh toán" }).first(),
		).toBeVisible();

		// ==========================================
		// 4. Payment: Thực hiện thanh toán hóa đơn
		// ==========================================
		await page.getByTitle("Xem").first().click();
		await expect(page).toHaveURL(/\/invoices\/501$/);

		// Verify ban đầu ở trạng thái Chưa thanh toán
		await expect(page.getByText("Chưa thanh toán").first()).toBeVisible();

		// Đổi trạng thái trong bộ nhớ mock API sang PAID (Đã thanh toán) để mô phỏng webhook payment
		mockInvoices[0].status = "PAID";

		// Tải lại trang chi tiết hóa đơn
		await page.reload();

		// Xác nhận trạng thái hóa đơn cập nhật sang Đã thanh toán
		await expect(page.getByText("Đã thanh toán").first()).toBeVisible();

		// Quay lại kiểm tra trang chi tiết cư dân để xác nhận hóa đơn cũng liên kết thành công
		await page.goto("/residents");
		await page.getByTitle("Xem").nth(1).click({ force: true });
		await expect(page).toHaveURL(/\/residents\/18$/);

		// Xác nhận hiển thị hóa đơn đã thanh toán trên trang chi tiết cư dân
		await expect(
			page.getByRole("cell", { name: "Đã thanh toán" }).first(),
		).toBeVisible();

		// ==========================================
		// 5. Settle & Checkout: Tất toán & Xóa cư dân/căn hộ giải phóng hợp đồng
		// ==========================================
		// Xóa cư dân khỏi hệ thống
		await page.goto("/residents");
		await page.getByTitle("Xóa").nth(1).click({ force: true });

		// Xác nhận xóa trong PopConfirm
		await expect(page.getByText("Xác nhận xóa")).toBeVisible();
		await page.getByRole("button", { name: "Tiếp tục" }).click();

		// Cư dân đã bị xóa
		await expect(
			page.getByRole("cell", { name: "Nguyễn Văn Thuê" }),
		).not.toBeVisible();

		// Xóa căn hộ khỏi hệ thống
		await page.goto("/apartments");
		await page.getByTitle("Xóa").nth(1).click({ force: true });

		// Xác nhận xóa căn hộ
		await expect(page.getByText("Xác nhận xóa")).toBeVisible();
		await page.getByRole("button", { name: "Tiếp tục" }).click();

		// Căn hộ đã bị xóa
		await expect(page.getByRole("cell", { name: "A.10-15" })).not.toBeVisible();
	});
});
