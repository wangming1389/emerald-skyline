import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createE2eApp, truncateDatabase } from "./helpers/test-db.helper";

describe("AppController (e2e)", () => {
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

	it("GET /api/v1", () => {
		return request(app.getHttpServer())
			.get("/api/v1")
			.expect(200)
			.expect("Emerald Skyline Management System API - Online");
	});
});
