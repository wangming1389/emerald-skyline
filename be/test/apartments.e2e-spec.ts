import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ApartmentType } from "../src/modules/apartments/enums/apartment-type.enum";
import { RelationshipType } from "../src/modules/apartments/enums/relationship-type.enum";
import { BlockStatus } from "../src/modules/blocks/enums/block-status.enum";
import { seedBlock, seedResident, unwrap } from "./helpers/e2e-fixtures";
import { createE2eApp, truncateDatabase } from "./helpers/test-db.helper";

describe("Blocks and Apartments (e2e)", () => {
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

	it("creates a block, creates an apartment, and assigns residents", async () => {
		const ownerFixture = await seedResident(app, {
			fullName: "E2E Apartment Owner",
		});
		const memberFixture = await seedResident(app, {
			fullName: "E2E Apartment Member",
		});

		const blockName = `E2E Tower ${Date.now()}`;
		const blockResponse = await request(app.getHttpServer())
			.post("/api/v1/blocks")
			.send({
				buildingName: blockName,
				managerName: "E2E Manager",
				managerPhone: "0900000001",
				status: BlockStatus.OPERATING,
			})
			.expect(201);

		const block = unwrap<{ id: number; buildingName: string }>(
			blockResponse.body,
		);
		expect(block.buildingName).toBe(blockName);

		const roomName = `E2E-${Date.now()}`;
		await request(app.getHttpServer())
			.post("/api/v1/apartments")
			.send({
				roomName,
				type: ApartmentType.TWO_BEDROOM,
				blockId: block.id,
				floor: 12,
				area: 75,
				owner_id: ownerFixture.resident.id,
				residents: [
					{
						id: memberFixture.resident.id,
						relationship: RelationshipType.SPOUSE,
					},
				],
			})
			.expect(201)
			.expect((response) => {
				const apartment = unwrap<{
					generalInfo: { apartmentName: string; blockId: number };
					residents: Array<{ id: number; relationship: string }>;
				}>(response.body);
				expect(apartment.generalInfo.apartmentName).toBe(roomName);
				expect(apartment.generalInfo.blockId).toBe(block.id);
				expect(apartment.residents).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							id: ownerFixture.resident.id,
							relationship: RelationshipType.OWNER,
						}),
						expect.objectContaining({
							id: memberFixture.resident.id,
							relationship: RelationshipType.SPOUSE,
						}),
					]),
				);
			});

		const ownerResidences = await request(app.getHttpServer())
			.get(`/api/v1/residents/${ownerFixture.resident.id}/apartments`)
			.expect(200);
		expect(
			unwrap<{ residences: Array<{ apartment: { roomNumber: string } }> }>(
				ownerResidences.body,
			).residences,
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					apartment: expect.objectContaining({ roomNumber: roomName }),
				}),
			]),
		);
	});

	it("lists apartments by block", async () => {
		const { resident } = await seedResident(app);
		const block = await seedBlock(app);

		await request(app.getHttpServer())
			.post("/api/v1/apartments")
			.send({
				roomName: "E2E-LIST-1201",
				type: ApartmentType.STUDIO,
				blockId: block.id,
				floor: 12,
				area: 42,
				owner_id: resident.id,
			})
			.expect(201);

		const listed = await request(app.getHttpServer())
			.get("/api/v1/apartments")
			.query({ blockId: block.id })
			.expect(200);

		expect(unwrap<Array<{ roomName: string }>>(listed.body)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ roomName: "E2E-LIST-1201" }),
			]),
		);
	});
});
