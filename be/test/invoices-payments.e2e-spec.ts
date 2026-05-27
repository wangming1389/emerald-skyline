import { INestApplication } from "@nestjs/common";
import crypto from "crypto";
import request from "supertest";
import { DataSource } from "typeorm";
import { UserRole } from "../src/modules/accounts/enums/user-role.enum";
import { Invoice } from "../src/modules/invoices/entities/invoice.entity";
import { InvoiceStatus } from "../src/modules/invoices/enums/invoice-status.enum";
import { PaymentGateway } from "../src/modules/payments/enums/payment-gateway.enum";
import { PaymentTargetType } from "../src/modules/payments/enums/payment-target-type.enum";
import {
	E2E_PASSWORD,
	login,
	seedAccount,
	seedApartment,
	seedBlock,
	seedFees,
	seedResident,
	unwrap,
} from "./helpers/e2e-fixtures";
import { createE2eApp, truncateDatabase } from "./helpers/test-db.helper";

function signVnpayParams(params: Record<string, string>) {
	const sorted: Record<string, string> = {};
	Object.keys(params)
		.map((key) => encodeURIComponent(key))
		.sort()
		.forEach((encodedKey) => {
			const rawValue = params[encodedKey] ?? params[decodeURIComponent(encodedKey)];
			sorted[encodedKey] = encodeURIComponent(String(rawValue)).replace(
				/%20/g,
				"+",
			);
		});

	return crypto
		.createHmac(
			"sha512",
			process.env.VNPAY_HASH_SECRET || "e2e-vnpay-hash-secret",
		)
		.update(
			Buffer.from(
				Object.entries(sorted)
					.map(([key, value]) => `${key}=${value}`)
					.join("&"),
				"utf-8",
			),
		)
		.digest("hex");
}

describe("Invoices and Payments (e2e)", () => {
	let app: INestApplication;

	beforeAll(async () => {
		app = await createE2eApp();
	});

	beforeEach(async () => {
		await truncateDatabase(app);
		await seedFees(app);
	});

	afterAll(async () => {
		await app?.close();
	});

	it("creates an invoice, creates a VNPay transaction, and marks the invoice PAID via webhook", async () => {
		const admin = await seedAccount(app, { role: UserRole.ADMIN });
		const residentFixture = await seedResident(app);
		const block = await seedBlock(app);
		const apartment = await seedApartment(app, block, residentFixture.resident);
		const adminLogin = await login(app, admin.email, E2E_PASSWORD);
		const residentLogin = await login(
			app,
			residentFixture.account.email,
			E2E_PASSWORD,
		);

		const invoiceResponse = await request(app.getHttpServer())
			.post("/api/v1/invoices/admin")
			.set("Authorization", `Bearer ${adminLogin.accessToken}`)
			.send({
				apartmentId: apartment.id,
				waterIndex: 12,
				electricityIndex: 40,
				period: "2026-01-10",
			})
			.expect(201);
		const invoice = unwrap<{
			id: number;
			status: InvoiceStatus;
			totalAmount: string;
		}>(invoiceResponse.body);
		expect(invoice.status).toBe(InvoiceStatus.UNPAID);

		await request(app.getHttpServer())
			.get("/api/v1/residents/me/invoices")
			.set("Authorization", `Bearer ${residentLogin.accessToken}`)
			.expect(200)
			.expect((response) => {
				expect(
					unwrap<{ invoices: Array<{ id: number }> }>(response.body).invoices,
				).toEqual(
					expect.arrayContaining([expect.objectContaining({ id: invoice.id })]),
				);
			});

		const paymentResponse = await request(app.getHttpServer())
			.post("/api/v1/payments")
			.set("Authorization", `Bearer ${residentLogin.accessToken}`)
			.send({
				targetType: PaymentTargetType.INVOICE,
				targetId: invoice.id,
				paymentMethod: PaymentGateway.VNPAY,
				deviceType: "web",
				redirectUrl: "http://localhost:5173/payments/result",
			})
			.expect(201);
		const payment = unwrap<{
			transactionId: number;
			txnRef: string;
			amount: string;
			paymentUrl: string;
		}>(paymentResponse.body);
		expect(payment.txnRef).toEqual(expect.stringMatching(/^INV\d+$/));
		expect(payment.paymentUrl).toContain("vnp_SecureHash=");

		const webhookParams: Record<string, string> = {
			vnp_Amount: String(Math.round(Number(payment.amount) * 100)),
			vnp_BankCode: "NCB",
			vnp_BankTranNo: "E2E_BANK_TXN",
			vnp_CardType: "ATM",
			vnp_OrderInfo: `Thanh toan hoa don ${invoice.id}`,
			vnp_PayDate: "20260115101010",
			vnp_ResponseCode: "00",
			vnp_TmnCode: process.env.VNPAY_TMN_CODE || "E2ETMN",
			vnp_TransactionNo: "E2E_VNPAY_TXN",
			vnp_TransactionStatus: "00",
			vnp_TxnRef: payment.txnRef,
		};
		webhookParams.vnp_SecureHash = signVnpayParams(webhookParams);

		await request(app.getHttpServer())
			.get("/api/v1/payments/webhook/vnpay")
			.query(webhookParams)
			.expect(200);

		const dataSource = app.get(DataSource);
		const paidInvoice = await dataSource
			.getRepository(Invoice)
			.findOneByOrFail({
				id: invoice.id,
			});
		expect(paidInvoice.status).toBe(InvoiceStatus.PAID);

		await request(app.getHttpServer())
			.get(`/api/v1/payments/txn-ref/${payment.txnRef}`)
			.set("Authorization", `Bearer ${residentLogin.accessToken}`)
			.expect(200)
			.expect((response) => {
				expect(unwrap<{ status: string }>(response.body).status).toBe(
					"SUCCESS",
				);
			});
	});

	it("rejects a VNPay webhook with an invalid signature", async () => {
		await request(app.getHttpServer())
			.get("/api/v1/payments/webhook/vnpay")
			.query({
				vnp_TxnRef: "INV999123",
				vnp_ResponseCode: "00",
				vnp_Amount: "10000",
				vnp_TmnCode: "E2ETMN",
				vnp_SecureHash: "invalid",
			})
			.expect(400);
	});
});
