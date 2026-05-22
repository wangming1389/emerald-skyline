import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { DataSource } from "typeorm";
import { AppModule } from "../../src/app.module";

export function configureE2eEnvironment() {
	process.env.NODE_ENV = "test";
	process.env.JWT_SECRET = process.env.JWT_SECRET || "e2e-access-secret";
	process.env.JWT_REFRESH_SECRET =
		process.env.JWT_REFRESH_SECRET || "e2e-refresh-secret";
	process.env.JWT_EXPIRATION = process.env.JWT_EXPIRATION || "15m";
	process.env.JWT_REFRESH_EXPIRATION =
		process.env.JWT_REFRESH_EXPIRATION || "7d";
	process.env.FRONTEND_URL =
		process.env.FRONTEND_URL || "http://localhost:5173";
	process.env.BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
	process.env.VNPAY_TMN_CODE = process.env.VNPAY_TMN_CODE || "E2ETMN";
	process.env.VNPAY_HASH_SECRET =
		process.env.VNPAY_HASH_SECRET || "e2e-vnpay-hash-secret";

	if (!process.env.E2E_DATABASE_URL) {
		throw new Error(
			"E2E_DATABASE_URL is required for backend E2E tests. Refusing to use DATABASE_URL directly.",
		);
	}

	process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
}

export async function createE2eApp(): Promise<INestApplication> {
	configureE2eEnvironment();

	const moduleFixture: TestingModule = await Test.createTestingModule({
		imports: [AppModule],
	}).compile();

	const app = moduleFixture.createNestApplication();
	app.use(cookieParser());
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: {
				enableImplicitConversion: false,
			},
		}),
	);
	app.setGlobalPrefix("api/v1");

	await app.init();
	return app;
}

export async function truncateDatabase(app: INestApplication) {
	const dataSource = app.get(DataSource);
	const tableNames = dataSource.entityMetadatas
		.map((metadata) => `"${metadata.tableName}"`)
		.join(", ");

	if (!tableNames) {
		return;
	}

	await dataSource.query(
		`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`,
	);
}
