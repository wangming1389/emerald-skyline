import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { UserRole } from "../src/modules/accounts/enums/user-role.enum";
import { Gender } from "../src/modules/residents/enums/gender.enum";
import {
	E2E_PASSWORD,
	login,
	seedAccount,
	uniqueEmail,
	unwrap,
} from "./helpers/e2e-fixtures";
import { createE2eApp, truncateDatabase } from "./helpers/test-db.helper";

describe("Accounts and Residents (e2e)", () => {
	let app: INestApplication;

	beforeAll(async () => {
		app = await createE2eApp();
	});

	beforeEach(async () => {
		await truncateDatabase(app);
	});

	afterAll(async () => {
		await app?.close();
	});

	it("creates, lists, updates, and soft deletes an account", async () => {
		const admin = await seedAccount(app, { role: UserRole.ADMIN });
		await login(app, admin.email, E2E_PASSWORD);

		const email = uniqueEmail("crud-account");
		const created = await request(app.getHttpServer())
			.post("/api/v1/accounts")
			.send({ email, password: E2E_PASSWORD, role: UserRole.RESIDENT })
			.expect(201);
		const account = unwrap<{ id: number; email: string }>(created.body);
		expect(account.email).toBe(email);

		const listed = await request(app.getHttpServer())
			.get("/api/v1/accounts")
			.query({ search: email })
			.expect(200);
		expect(unwrap<Array<{ email: string }>>(listed.body)).toEqual(
			expect.arrayContaining([expect.objectContaining({ email })]),
		);

		const updatedEmail = uniqueEmail("updated-account");
		const updated = await request(app.getHttpServer())
			.patch(`/api/v1/accounts/${account.id}`)
			.send({ email: updatedEmail })
			.expect(200);
		expect(unwrap<{ email: string }>(updated.body).email).toBe(updatedEmail);

		const removed = await request(app.getHttpServer())
			.delete(`/api/v1/accounts/${account.id}`)
			.expect(200);
		expect(unwrap<{ isActive: boolean }>(removed.body).isActive).toBe(false);
	});

	it("creates a resident profile and links it with a resident account", async () => {
		const email = uniqueEmail("resident-profile");
		const citizenId = `${Date.now()}`.slice(-12).padStart(12, "0");

		const created = await request(app.getHttpServer())
			.post("/api/v1/residents")
			.field("email", email)
			.field("fullName", "E2E Resident Profile")
			.field("citizenId", citizenId)
			.field("dob", "1998-02-03")
			.field("gender", Gender.FEMALE)
			.field("phoneNumber", "0901234567")
			.field("nationality", "Vietnam")
			.field("province", "Ho Chi Minh")
			.field("district", "District 1")
			.field("ward", "Ben Nghe")
			.field("detailAddress", "2 E2E Street")
			.expect(201);

		const resident = unwrap<{
			id: number;
			account: { email: string; role: string };
		}>(created.body);
		expect(resident.account.email).toBe(email);
		expect(resident.account.role).toBe(UserRole.RESIDENT);

		const residentLogin = await login(app, email, citizenId);
		await request(app.getHttpServer())
			.get("/api/v1/residents/me")
			.set("Authorization", `Bearer ${residentLogin.accessToken}`)
			.expect(200)
			.expect((response) => {
				expect(unwrap<{ fullName: string }>(response.body).fullName).toBe(
					"E2E Resident Profile",
				);
			});
	});

	it("blocks resident access to admin-only invoice creation", async () => {
		const residentAccount = await seedAccount(app, { role: UserRole.RESIDENT });
		const residentLogin = await login(app, residentAccount.email, E2E_PASSWORD);

		await request(app.getHttpServer())
			.post("/api/v1/invoices/admin")
			.set("Authorization", `Bearer ${residentLogin.accessToken}`)
			.send({
				apartmentId: 1,
				waterIndex: 10,
				electricityIndex: 20,
				period: "2026-01-01",
			})
			.expect(403);
	});
});
