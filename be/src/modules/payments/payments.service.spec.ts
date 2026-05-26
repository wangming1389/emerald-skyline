import {
	BadRequestException,
	HttpException,
	HttpStatus,
	NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Booking } from "../bookings/entities/booking.entity";
import { BookingStatus } from "../bookings/enums/booking-status.enum";
import { Invoice } from "../invoices/entities/invoice.entity";
import { InvoiceStatus } from "../invoices/enums/invoice-status.enum";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { PaymentTransaction } from "./entities/payment-transaction.entity";
import { PaymentGateway } from "./enums/payment-gateway.enum";
import { PaymentStatus } from "./enums/payment-status.enum";
import { PaymentTargetType } from "./enums/payment-target-type.enum";
import { PaymentsService } from "./payments.service";
import { MoMoService } from "./services/momo.service";
import { VNPayService } from "./services/vnpay.service";

const fixedNow = new Date("2026-04-23T08:00:00.000Z").getTime();

const mockInvoice = {
	id: 1,
	invoiceCode: "INV-202604-A101",
	totalAmount: 750000,
	status: InvoiceStatus.UNPAID,
	apartment: { name: "A101" },
} as Invoice;

const mockBooking = {
	id: 2,
	code: "BK-0001",
	totalPrice: 320000,
	status: BookingStatus.PENDING,
	service: { name: "Gym" },
} as Booking;

const mockPayment = {
	id: 10,
	txnRef: "INV11713859200000",
	targetType: PaymentTargetType.INVOICE,
	targetId: 1,
	accountId: 99,
	amount: 750000,
	currency: "VND",
	paymentMethod: PaymentGateway.VNPAY,
	status: PaymentStatus.PENDING,
	description: "Thanh toan hoa don INV-202604-A101 - A101",
	expiresAt: new Date(fixedNow + 15 * 60 * 1000),
	retryCount: 0,
	rawLog: {},
	createdAt: new Date(fixedNow),
	updatedAt: new Date(fixedNow),
} as PaymentTransaction;

describe("PaymentsService", () => {
	let service: PaymentsService;
	let paymentRepository: jest.Mocked<Repository<PaymentTransaction>>;
	let invoiceRepository: jest.Mocked<Repository<Invoice>>;
	let bookingRepository: jest.Mocked<Repository<Booking>>;
	let momoService: jest.Mocked<MoMoService>;
	let vnpayService: jest.Mocked<VNPayService>;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				PaymentsService,
				{
					provide: getRepositoryToken(PaymentTransaction),
					useValue: {
						create: jest.fn(),
						save: jest.fn(),
						findOne: jest.fn(),
						find: jest.fn(),
						update: jest.fn(),
					},
				},
				{
					provide: getRepositoryToken(Invoice),
					useValue: {
						findOne: jest.fn(),
						find: jest.fn(),
						update: jest.fn(),
					},
				},
				{
					provide: getRepositoryToken(Booking),
					useValue: {
						findOne: jest.fn(),
						find: jest.fn(),
						update: jest.fn(),
					},
				},
				{
					provide: MoMoService,
					useValue: {
						isAvailable: jest.fn(),
						createPayment: jest.fn(),
						verifySignature: jest.fn(),
					},
				},
				{
					provide: VNPayService,
					useValue: {
						createPayment: jest.fn(),
						verifySignature: jest.fn(),
					},
				},
			],
		}).compile();

		service = module.get(PaymentsService);
		paymentRepository = module.get(getRepositoryToken(PaymentTransaction));
		invoiceRepository = module.get(getRepositoryToken(Invoice));
		bookingRepository = module.get(getRepositoryToken(Booking));
		momoService = module.get(MoMoService);
		vnpayService = module.get(VNPayService);

		process.env.FRONTEND_URL = "https://frontend.example.com";
		process.env.BACKEND_URL = "https://backend.example.com";
		process.env.MOBILE_APP_REDIRECT_URL =
			"https://backend.example.com/api/v1/payments/mobile-callback";

		jest.spyOn(Date, "now").mockReturnValue(fixedNow);
	});

	afterEach(() => {
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});

	it("creates a VNPay invoice payment successfully", async () => {
		const dto: CreatePaymentDto = {
			targetType: PaymentTargetType.INVOICE,
			targetId: 1,
			paymentMethod: PaymentGateway.VNPAY,
			deviceType: "web",
			redirectUrl: "https://frontend.example.com/custom-result",
		};

		jest
			.spyOn(invoiceRepository, "findOne")
			.mockResolvedValue(mockInvoice as any);
		jest.spyOn(paymentRepository, "findOne").mockResolvedValue(null);
		jest
			.spyOn(paymentRepository, "create")
			.mockImplementation((data) => data as any);
		jest
			.spyOn(paymentRepository, "save")
			.mockImplementation(async (data: any) => ({ id: 10, ...data }) as any);
		jest.spyOn(vnpayService, "createPayment").mockReturnValue({
			payUrl: "https://sandbox.vnpay.vn/pay",
		} as any);

		const result = await service.createPayment(99, dto);

		expect(result.paymentUrl).toBe("https://sandbox.vnpay.vn/pay");
		expect(result.amount).toBe(750000);
		expect(vnpayService.createPayment).toHaveBeenCalledWith(
			expect.objectContaining({
				orderId: expect.stringContaining("INV1"),
				amount: 750000,
				returnUrl: "https://frontend.example.com/custom-result",
			}),
		);
		expect(paymentRepository.save).toHaveBeenCalledTimes(2);
	});

	it("rejects invoice payment when invoice is already paid", async () => {
		jest.spyOn(invoiceRepository, "findOne").mockResolvedValue({
			...mockInvoice,
			status: InvoiceStatus.PAID,
		} as any);

		await expect(
			service.createPayment(99, {
				targetType: PaymentTargetType.INVOICE,
				targetId: 1,
				paymentMethod: PaymentGateway.VNPAY,
			} as CreatePaymentDto),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("marks payment as failed when MoMo is unavailable", async () => {
		jest
			.spyOn(invoiceRepository, "findOne")
			.mockResolvedValue(mockInvoice as any);
		jest.spyOn(paymentRepository, "findOne").mockResolvedValue(null);
		jest
			.spyOn(paymentRepository, "create")
			.mockImplementation((data) => data as any);
		const saveSpy = jest
			.spyOn(paymentRepository, "save")
			.mockImplementation(async (data: any) => ({ id: 10, ...data }) as any);
		jest.spyOn(momoService, "isAvailable").mockReturnValue(false);

		await expect(
			service.createPayment(99, {
				targetType: PaymentTargetType.INVOICE,
				targetId: 1,
				paymentMethod: PaymentGateway.MOMO,
			} as CreatePaymentDto),
		).rejects.toMatchObject({
			status: HttpStatus.INTERNAL_SERVER_ERROR,
		});

		expect(saveSpy).toHaveBeenLastCalledWith(
			expect.objectContaining({
				status: PaymentStatus.FAILED,
				rawLog: expect.objectContaining({
					error: expect.any(String),
				}),
			}),
		);
	});

	it("creates a batch invoice payment and skips already paid invoices", async () => {
		jest.spyOn(invoiceRepository, "find").mockResolvedValue([
			mockInvoice,
			{
				...mockInvoice,
				id: 2,
				totalAmount: 150000,
				status: InvoiceStatus.PAID,
			},
			{
				...mockInvoice,
				id: 3,
				totalAmount: 250000,
				status: InvoiceStatus.UNPAID,
			},
		] as any);
		jest
			.spyOn(paymentRepository, "create")
			.mockImplementation((data) => data as any);
		jest
			.spyOn(paymentRepository, "save")
			.mockImplementation(async (data: any) => ({ id: 15, ...data }) as any);
		jest.spyOn(vnpayService, "createPayment").mockReturnValue({
			payUrl: "https://sandbox.vnpay.vn/batch-pay",
		} as any);

		const result = await service.createBatchPayment(
			99,
			PaymentTargetType.INVOICE,
			[1, 2, 3],
			PaymentGateway.VNPAY,
			"web",
		);

		expect(result.amount).toBe(1000000);
		expect(result.batchIds).toEqual([1, 3]);
		expect(result.itemCount).toBe(2);
		expect(vnpayService.createPayment).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: 1000000,
				orderInfo: "Thanh toan 2 items",
			}),
		);
	});

	it("findOne throws when payment does not exist", async () => {
		jest.spyOn(paymentRepository, "findOne").mockResolvedValue(null);

		await expect(service.findOne(404)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it("handles MoMo webhook success and updates invoice status", async () => {
		const payment = {
			...mockPayment,
			paymentMethod: PaymentGateway.MOMO,
			rawLog: { batchIds: [1, 3] },
		} as PaymentTransaction;

		jest.spyOn(momoService, "verifySignature").mockReturnValue(true);
		jest.spyOn(paymentRepository, "findOne").mockResolvedValue(payment as any);
		jest
			.spyOn(paymentRepository, "save")
			.mockImplementation(async (data: any) => data as any);
		jest
			.spyOn(invoiceRepository, "update")
			.mockResolvedValue({ affected: 2 } as any);

		const result = await service.handleMoMoWebhook({
			orderId: payment.txnRef,
			resultCode: 0,
			transId: "MOMO123",
			message: "Success",
			responseTime: fixedNow,
		});

		expect(result).toEqual({ message: "Webhook processed successfully" });
		expect(paymentRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				status: PaymentStatus.SUCCESS,
				gatewayTxnId: "MOMO123",
			}),
		);
		expect(invoiceRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: expect.anything() }),
			{ status: InvoiceStatus.PAID },
		);
	});

	it("rejects VNPay webhook when signature is invalid", async () => {
		jest.spyOn(vnpayService, "verifySignature").mockReturnValue(false);

		await expect(
			service.handleVNPayWebhook({
				vnp_TxnRef: "INV11713859200000",
				vnp_ResponseCode: "00",
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("handles VNPay webhook success for batch booking payment", async () => {
		const payment = {
			...mockPayment,
			targetType: PaymentTargetType.BOOKING,
			targetId: 2,
			rawLog: { batchIds: [2, 5] },
		} as PaymentTransaction;

		jest.spyOn(vnpayService, "verifySignature").mockReturnValue(true);
		jest.spyOn(paymentRepository, "findOne").mockResolvedValue(payment as any);
		jest
			.spyOn(paymentRepository, "save")
			.mockImplementation(async (data: any) => data as any);
		jest
			.spyOn(bookingRepository, "update")
			.mockResolvedValue({ affected: 2 } as any);

		const result = await service.handleVNPayWebhook({
			vnp_TxnRef: payment.txnRef,
			vnp_ResponseCode: "00",
			vnp_TransactionNo: "VNP123",
			vnp_PayDate: "20260423153045",
		});

		expect(result).toEqual({ message: "Webhook processed successfully" });
		expect(paymentRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				status: PaymentStatus.SUCCESS,
				gatewayTxnId: "VNP123",
				payDate: new Date(2026, 3, 23, 15, 30, 45),
			}),
		);
		expect(bookingRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: expect.anything() }),
			{ status: BookingStatus.PAID },
		);
	});

	it("marks old pending payments as failed during cleanup", async () => {
		jest
			.spyOn(paymentRepository, "update")
			.mockResolvedValue({ affected: 4 } as any);

		const result = await service.cleanupExpiredPayments();

		expect(result).toEqual({ affected: 4 });
		expect(paymentRepository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				status: PaymentStatus.PENDING,
				createdAt: expect.anything(),
			}),
			{ status: PaymentStatus.FAILED },
		);
	});

	describe("Integration: Payment Flows", () => {
		it("creates an invoice payment then completes it via VNPay webhook", async () => {
			jest
				.spyOn(invoiceRepository, "findOne")
				.mockResolvedValue(mockInvoice as any);
			jest.spyOn(paymentRepository, "findOne").mockResolvedValue(null);
			jest
				.spyOn(paymentRepository, "create")
				.mockImplementation((data) => data as any);
			jest
				.spyOn(paymentRepository, "save")
				.mockImplementation(async (data: any) => ({ id: 21, ...data }) as any);
			jest.spyOn(vnpayService, "createPayment").mockReturnValue({
				payUrl: "https://sandbox.vnpay.vn/pay",
			} as any);

			const created = await service.createPayment(99, {
				targetType: PaymentTargetType.INVOICE,
				targetId: 1,
				paymentMethod: PaymentGateway.VNPAY,
			} as CreatePaymentDto);

			expect(created.txnRef).toContain("INV1");
			expect(created.paymentUrl).toBe("https://sandbox.vnpay.vn/pay");

			jest.clearAllMocks();

			const persistedPayment = {
				...mockPayment,
				id: created.transactionId,
				txnRef: created.txnRef,
			} as PaymentTransaction;

			jest.spyOn(vnpayService, "verifySignature").mockReturnValue(true);
			jest
				.spyOn(paymentRepository, "findOne")
				.mockResolvedValue(persistedPayment as any);
			jest
				.spyOn(paymentRepository, "save")
				.mockImplementation(async (data: any) => data as any);
			jest
				.spyOn(invoiceRepository, "update")
				.mockResolvedValue({ affected: 1 } as any);

			const webhookResult = await service.handleVNPayWebhook({
				vnp_TxnRef: created.txnRef,
				vnp_ResponseCode: "00",
				vnp_TransactionNo: "VNP999",
				vnp_PayDate: "20260423160030",
			});

			expect(webhookResult).toEqual({
				message: "Webhook processed successfully",
			});
			expect(paymentRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					status: PaymentStatus.SUCCESS,
					gatewayTxnId: "VNP999",
				}),
			);
			expect(invoiceRepository.update).toHaveBeenCalledWith(
				expect.objectContaining({ id: expect.anything() }),
				{ status: InvoiceStatus.PAID },
			);
		});

		it("creates a batch booking payment then completes it via MoMo webhook", async () => {
			jest.spyOn(bookingRepository, "find").mockResolvedValue([
				mockBooking,
				{
					...mockBooking,
					id: 5,
					totalPrice: 180000,
					status: BookingStatus.PENDING,
				},
			] as any);
			jest
				.spyOn(paymentRepository, "create")
				.mockImplementation((data) => data as any);
			jest
				.spyOn(paymentRepository, "save")
				.mockImplementation(async (data: any) => ({ id: 31, ...data }) as any);
			jest.spyOn(momoService, "isAvailable").mockReturnValue(true);
			jest.spyOn(momoService, "createPayment").mockResolvedValue({
				payUrl: "https://test-payment.momo.vn/batch",
			} as any);

			const created = await service.createBatchPayment(
				99,
				PaymentTargetType.BOOKING,
				[2, 5],
				PaymentGateway.MOMO,
			);

			expect(created.batchIds).toEqual([2, 5]);
			expect(created.itemCount).toBe(2);

			jest.clearAllMocks();

			const persistedPayment = {
				...mockPayment,
				id: created.transactionId,
				txnRef: created.txnRef,
				targetType: PaymentTargetType.BOOKING,
				targetId: 2,
				paymentMethod: PaymentGateway.MOMO,
				amount: created.amount,
				rawLog: { batchIds: created.batchIds },
			} as PaymentTransaction;

			jest.spyOn(momoService, "verifySignature").mockReturnValue(true);
			jest
				.spyOn(paymentRepository, "findOne")
				.mockResolvedValue(persistedPayment as any);
			jest
				.spyOn(paymentRepository, "save")
				.mockImplementation(async (data: any) => data as any);
			jest
				.spyOn(bookingRepository, "update")
				.mockResolvedValue({ affected: 2 } as any);

			const webhookResult = await service.handleMoMoWebhook({
				orderId: created.txnRef,
				resultCode: 0,
				transId: "MOMO999",
				message: "Success",
				responseTime: fixedNow,
			});

			expect(webhookResult).toEqual({
				message: "Webhook processed successfully",
			});
			expect(bookingRepository.update).toHaveBeenCalledWith(
				expect.objectContaining({ id: expect.anything() }),
				{ status: BookingStatus.PAID },
			);
		});
	});
});
