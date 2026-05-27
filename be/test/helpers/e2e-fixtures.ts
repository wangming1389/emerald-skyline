import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { Account } from "../../src/modules/accounts/entities/account.entity";
import { UserRole } from "../../src/modules/accounts/enums/user-role.enum";
import { Apartment } from "../../src/modules/apartments/entities/apartment.entity";
import { ApartmentResident } from "../../src/modules/apartments/entities/apartment-resident.entity";
import { ApartmentStatus } from "../../src/modules/apartments/enums/apartment-status.enum";
import { ApartmentType } from "../../src/modules/apartments/enums/apartment-type.enum";
import { RelationshipType } from "../../src/modules/apartments/enums/relationship-type.enum";
import { Block } from "../../src/modules/blocks/entities/block.entity";
import { BlockStatus } from "../../src/modules/blocks/enums/block-status.enum";
import { Fee } from "../../src/modules/fees/entities/fee.entity";
import { FeeTier } from "../../src/modules/fees/entities/fee-tier.entity";
import { FeeType } from "../../src/modules/fees/enums/fee-type.enum";
import { Resident } from "../../src/modules/residents/entities/resident.entity";
import { Gender } from "../../src/modules/residents/enums/gender.enum";

export const E2E_PASSWORD = "StrongPassword123!";

export function uniqueEmail(prefix: string) {
	return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2)}@e2e.test`;
}

export function unwrap<T = any>(body: any): T {
	return (body?.data ?? body) as T;
}

export async function seedAccount(
	app: INestApplication,
	overrides: Partial<Account> = {},
) {
	const dataSource = app.get(DataSource);
	const accountRepository = dataSource.getRepository(Account);
	const account = accountRepository.create({
		email: overrides.email || uniqueEmail("account"),
		password: overrides.password || E2E_PASSWORD,
		role: overrides.role || UserRole.RESIDENT,
		isActive: overrides.isActive ?? true,
	});

	return accountRepository.save(account);
}

export async function seedResident(
	app: INestApplication,
	overrides: {
		account?: Account;
		email?: string;
		citizenId?: string;
		fullName?: string;
	} = {},
) {
	const dataSource = app.get(DataSource);
	const account =
		overrides.account ||
		(await seedAccount(app, {
			email: overrides.email || uniqueEmail("resident"),
			role: UserRole.RESIDENT,
			password: E2E_PASSWORD,
		}));

	const residentRepository = dataSource.getRepository(Resident);
	const uniquePart = `${Date.now()}${Math.floor(Math.random() * 10000)}`.slice(
		-12,
	);
	const resident = residentRepository.create({
		accountId: account.id,
		fullName: overrides.fullName || "E2E Resident",
		citizenId: overrides.citizenId || uniquePart.padStart(12, "0"),
		dob: new Date("1999-01-01"),
		gender: Gender.MALE,
		phoneNumber: `09${uniquePart.slice(-8)}`,
		nationality: "Vietnam",
		province: "Ho Chi Minh",
		district: "District 1",
		ward: "Ben Nghe",
		detailAddress: "1 E2E Street",
		isActive: true,
	});

	return { account, resident: await residentRepository.save(resident) };
}

export async function seedBlock(app: INestApplication) {
	const dataSource = app.get(DataSource);
	const blockRepository = dataSource.getRepository(Block);
	const block = blockRepository.create({
		name: `E2E Block ${Date.now()}`,
		managerName: "E2E Manager",
		managerPhone: "0900000000",
		totalFloors: 20,
		status: BlockStatus.OPERATING,
		isActive: true,
	});

	return blockRepository.save(block);
}

export async function seedApartment(
	app: INestApplication,
	block: Block,
	resident: Resident,
) {
	const dataSource = app.get(DataSource);
	const apartmentRepository = dataSource.getRepository(Apartment);
	const relationRepository = dataSource.getRepository(ApartmentResident);
	const apartment = await apartmentRepository.save(
		apartmentRepository.create({
			name: `E2E-${Date.now()}`,
			blockId: block.id,
			floor: 10,
			type: ApartmentType.TWO_BEDROOM,
			area: 72,
			status: ApartmentStatus.OCCUPIED,
			isActive: true,
		}),
	);

	await relationRepository.save(
		relationRepository.create({
			apartmentId: apartment.id,
			residentId: resident.id,
			apartment,
			resident,
			relationship: RelationshipType.OWNER,
		}),
	);

	return apartment;
}

export async function seedFees(app: INestApplication) {
	const dataSource = app.get(DataSource);
	const feeRepository = dataSource.getRepository(Fee);
	const tierRepository = dataSource.getRepository(FeeTier);

	const water = await feeRepository.save(
		feeRepository.create({
			name: "Tiền nước",
			unit: "m3",
			type: FeeType.METERED,
			description: "E2E water fee",
			isActive: true,
		}),
	);
	const electricity = await feeRepository.save(
		feeRepository.create({
			name: "Tiền điện",
			unit: "kWh",
			type: FeeType.METERED,
			description: "E2E electricity fee",
			isActive: true,
		}),
	);

	await tierRepository.save([
		tierRepository.create({
			feeTypeId: water.id,
			name: "Water base",
			fromValue: 0,
			toValue: undefined,
			unitPrice: 10000,
			isActive: true,
		}),
		tierRepository.create({
			feeTypeId: electricity.id,
			name: "Electricity base",
			fromValue: 0,
			toValue: undefined,
			unitPrice: 3000,
			isActive: true,
		}),
	]);
}

export async function login(
	app: INestApplication,
	email: string,
	password: string,
) {
	const response = await request(app.getHttpServer())
		.post("/api/v1/auth/login")
		.send({ email, password })
		.expect(200);

	return {
		accessToken: unwrap<{ accessToken: string }>(response.body).accessToken,
		cookies: response.headers["set-cookie"] as unknown as string[],
		body: unwrap(response.body),
	};
}
