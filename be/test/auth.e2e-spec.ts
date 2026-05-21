import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { UserRole } from "../src/modules/accounts/enums/user-role.enum";
import {
	E2E_PASSWORD,
	login,
	seedAccount,
	uniqueEmail,
	unwrap,
} from "./helpers/e2e-fixtures";
import { createE2eApp, truncateDatabase } from "./helpers/test-db.helper";

describe("Auth (e2e)", () => {
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

	it("logs in, reads profile, refreshes token, changes password, and logs out", async () => {
		const account = await seedAccount(app, { role: UserRole.ADMIN });

		const loginResult = await login(app, account.email, E2E_PASSWORD);
		expect(loginResult.accessToken).toEqual(expect.any(String));
		expect(loginResult.cookies?.join(";")).toContain("refreshToken=");

		const profile = await request(app.getHttpServer())
			.get("/api/v1/auth/profile")
			.set("Authorization", `Bearer ${loginResult.accessToken}`)
			.expect(200);
		expect(unwrap<{ email: string }>(profile.body).email).toBe(account.email);

		const refresh = await request(app.getHttpServer())
			.post("/api/v1/auth/refresh")
			.set("Cookie", loginResult.cookies)
			.expect(200);
		expect(unwrap<{ accessToken: string }>(refresh.body).accessToken).toEqual(
			expect.any(String),
		);
		expect(
			(refresh.headers["set-cookie"] as unknown as string[]).join(";"),
		).toContain("refreshToken=");

		const newPassword = "NewPassword123!";
		await request(app.getHttpServer())
			.post("/api/v1/auth/change-password")
			.set("Authorization", `Bearer ${loginResult.accessToken}`)
			.send({ oldPassword: E2E_PASSWORD, newPassword })
			.expect(200);

		await request(app.getHttpServer())
			.post("/api/v1/auth/login")
			.send({ email: account.email, password: E2E_PASSWORD })
			.expect(401);

		const changedLogin = await login(app, account.email, newPassword);
		await request(app.getHttpServer())
			.post("/api/v1/auth/logout")
			.set("Authorization", `Bearer ${changedLogin.accessToken}`)
			.expect(200)
			.expect((response) => {
				expect(
					(response.headers["set-cookie"] as unknown as string[]).join(";"),
				).toContain("refreshToken=;");
			});
	});

	it("rejects invalid login and unauthenticated profile requests", async () => {
		await seedAccount(app, {
			email: uniqueEmail("invalid-login"),
			password: E2E_PASSWORD,
		});

		await request(app.getHttpServer())
			.post("/api/v1/auth/login")
			.send({ email: uniqueEmail("missing"), password: "WrongPassword123!" })
			.expect(401);

		await request(app.getHttpServer()).get("/api/v1/auth/profile").expect(401);
	});
});
