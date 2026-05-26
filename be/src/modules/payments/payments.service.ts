import {
	BadRequestException,
	HttpException,
	HttpStatus,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { In, LessThan, Repository } from "typeorm";
import { Booking } from "../bookings/entities/booking.entity";
import { BookingStatus } from "../bookings/enums/booking-status.enum";
import { Invoice } from "../invoices/entities/invoice.entity";
import { InvoiceStatus } from "../invoices/enums/invoice-status.enum";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { PaymentTransaction } from "./entities/payment-transaction.entity";
import { PaymentGateway } from "./enums/payment-gateway.enum";
import { PaymentStatus } from "./enums/payment-status.enum";
import { PaymentTargetType } from "./enums/payment-target-type.enum";
import { MoMoService } from "./services/momo.service";
import { VNPayService } from "./services/vnpay.service";

@Injectable()
export class PaymentsService {
	constructor(
		@InjectRepository(PaymentTransaction)
		private readonly paymentRepository: Repository<PaymentTransaction>,
		@InjectRepository(Invoice)
		private readonly invoiceRepository: Repository<Invoice>,
		@InjectRepository(Booking)
		private readonly bookingRepository: Repository<Booking>,
		private readonly momoService: MoMoService,
		private readonly vnpayService: VNPayService,
	) {}

	async createPayment(
		accountId: number,
		createPaymentDto: CreatePaymentDto,
		userAgent?: string,
	) {
		const { targetType, targetId, paymentMethod, deviceType, redirectUrl } =
			createPaymentDto;

		// Validate target exists and get amount
		let amount: number;
		let description: string;

		if (targetType === PaymentTargetType.INVOICE) {
			const invoice = await this.invoiceRepository.findOne({
				where: { id: targetId },
				relations: ["apartment"],
			});

			if (!invoice) {
				throw new NotFoundException("Hóa đơn không tồn tại");
			}

			if (invoice.status === InvoiceStatus.PAID) {
				throw new BadRequestException("Hóa đơn đã được thanh toán");
			}

			amount = Number(invoice.totalAmount);
			description = `Thanh toan hoa don ${invoice.invoiceCode} - ${invoice.apartment?.name || "Can ho"}`;
		} else if (targetType === PaymentTargetType.BOOKING) {
			const booking = await this.bookingRepository.findOne({
				where: { id: targetId },
				relations: ["service"],
			});

			if (!booking) {
				throw new NotFoundException("Booking khong ton tai");
			}

			if (
				booking.status === BookingStatus.PAID ||
				booking.status === BookingStatus.COMPLETED
			) {
				throw new BadRequestException("Booking da duoc thanh toan");
			}

			amount = Number(booking.totalPrice);
			description = `Thanh toan booking ${booking.code} - ${booking.service?.name || "Dich vu"}`;
		} else {
			throw new BadRequestException("Loại thanh toán không hợp lệ");
		}

		// Generate unique txnRef
		const txnRef = this.generateTxnRef(targetType, targetId);

		// Check if payment already exists
		const existingPayment = await this.paymentRepository.findOne({
			where: { txnRef },
		});

		if (existingPayment && existingPayment.status === PaymentStatus.SUCCESS) {
			throw new BadRequestException("Đã có giao dịch thanh toán thành công");
		}

		// Create payment record
		const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

		const payment = this.paymentRepository.create({
			txnRef,
			targetType,
			targetId,
			accountId,
			amount,
			currency: "VND",
			paymentMethod,
			status: PaymentStatus.PENDING,
			description,
			expiresAt,
			retryCount: existingPayment ? existingPayment.retryCount + 1 : 0,
		});

		const savedPayment = await this.paymentRepository.save(payment);

		// Generate payment URL based on gateway
		let paymentUrl: string;

		// Determine redirect URL based on device type
		// IMPORTANT: VNPay/MoMo only support HTTP(S) URLs, NOT deep links
		// For mobile, we return HTTP URL and app handles the redirect
		let finalRedirectUrl: string;
		if (redirectUrl && !redirectUrl.startsWith("emerald://")) {
			// Custom HTTP(S) redirect URL provided
			finalRedirectUrl = redirectUrl;
		} else if (
			deviceType === "mobile" ||
			deviceType === "ios" ||
			deviceType === "android"
		) {
			// Mobile app - use HTTP redirect URL (gateway can't handle deep links)
			// IMPORTANT: Don't include query params here - VNPay will append its own params
			// VNPay redirects to this HTTP endpoint with all its params included in the URL
			const mobileRedirectUrl = process.env.MOBILE_APP_REDIRECT_URL;
			if (!mobileRedirectUrl) {
				console.error(
					"[Payment] ❌ ERROR: MOBILE_APP_REDIRECT_URL not set in environment!",
				);
				console.error(
					"[Payment] Please set MOBILE_APP_REDIRECT_URL to your backend HTTP URL",
				);
				throw new BadRequestException(
					"Mobile app redirect URL not configured. Please contact support.",
				);
			}
			// Don't add query params - VNPay will add them automatically
			finalRedirectUrl = mobileRedirectUrl;
		} else {
			// Web fallback
			finalRedirectUrl = `${process.env.FRONTEND_URL}/payments/result?source=gateway`;
		}

		try {
			if (paymentMethod === PaymentGateway.MOMO) {
				if (!this.momoService.isAvailable()) {
					throw new BadRequestException(
						"Cổng thanh toán MoMo chưa được cấu hình. Vui lòng sử dụng VNPay hoặc liên hệ quản trị viên.",
					);
				}
				const momoResult = await this.momoService.createPayment({
					orderId: txnRef,
					amount: amount,
					orderInfo: description,
					redirectUrl: finalRedirectUrl,
					ipnUrl: `${process.env.BACKEND_URL}/api/v1/payments/webhook/momo`,
					requestId: `${txnRef}_${Date.now()}`,
				});
				paymentUrl = momoResult.payUrl;
			} else if (paymentMethod === PaymentGateway.VNPAY) {
				const ipnUrl = `${process.env.BACKEND_URL}/api/v1/payments/webhook/vnpay`;
				console.log("[Payment] 🚀 Creating VNPay payment...");
				console.log("[Payment] VNPay params:", {
					orderId: txnRef,
					amount: amount,
					description: description,
					returnUrl: finalRedirectUrl,
					ipnUrl: ipnUrl,
				});

				const vnpayResult = this.vnpayService.createPayment({
					orderId: txnRef,
					amount: amount,
					orderInfo: description,
					returnUrl: finalRedirectUrl,
					ipnUrl: ipnUrl,
					ipAddr: "127.0.0.1",
				});
				paymentUrl = vnpayResult.payUrl;
			} else {
				throw new BadRequestException("Payment gateway không được hỗ trợ");
			}

			// Update payment with URL
			savedPayment.paymentUrl = paymentUrl;
			await this.paymentRepository.save(savedPayment);

			return {
				transactionId: savedPayment.id,
				txnRef: savedPayment.txnRef,
				paymentUrl,
				amount: savedPayment.amount,
				expiresAt: savedPayment.expiresAt,
			};
		} catch (error) {
			// Update payment status to FAILED
			savedPayment.status = PaymentStatus.FAILED;
			savedPayment.rawLog = { error: error.message };
			await this.paymentRepository.save(savedPayment);

			throw new HttpException(
				`Tạo link thanh toán thất bại: ${error.message}`,
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}
	}

	async createBatchPayment(
		accountId: number,
		targetType: PaymentTargetType,
		targetIds: number[],
		paymentMethod: PaymentGateway,
		deviceType?: string,
		redirectUrl?: string,
	) {
		if (!targetIds || targetIds.length === 0) {
			throw new BadRequestException("Phải cung cấp ít nhất 1 ID thanh toán");
		}

		// Validate all targets exist and get total amount
		let totalAmount = 0;
		const validTargetIds: number[] = [];

		if (targetType === PaymentTargetType.INVOICE) {
			const invoices = await this.invoiceRepository.find({
				where: { id: In(targetIds) },
				relations: ["apartment"],
			});

			if (invoices.length === 0) {
				throw new NotFoundException("Không tìm thấy hóa đơn nào");
			}

			// Filter out already paid invoices
			for (const invoice of invoices) {
				if (invoice.status !== InvoiceStatus.PAID) {
					totalAmount += Number(invoice.totalAmount);
					validTargetIds.push(invoice.id);
				}
			}

			if (validTargetIds.length === 0) {
				throw new BadRequestException("Tất cả các hóa đơn đã được thanh toán");
			}
		} else if (targetType === PaymentTargetType.BOOKING) {
			const bookings = await this.bookingRepository.find({
				where: { id: In(targetIds) },
				relations: ["service"],
			});

			if (bookings.length === 0) {
				throw new NotFoundException("Không tìm thấy booking nào");
			}

			// Filter out already paid bookings
			for (const booking of bookings) {
				if (
					booking.status !== BookingStatus.PAID &&
					booking.status !== BookingStatus.COMPLETED
				) {
					totalAmount += Number(booking.totalPrice);
					validTargetIds.push(booking.id);
				}
			}

			if (validTargetIds.length === 0) {
				throw new BadRequestException(
					"Tất cả các booking đã được thanh toán hoặc hoàn thành",
				);
			}
		} else {
			throw new BadRequestException("Loại thanh toán không hợp lệ");
		}

		// Use first valid ID for transaction creation
		const primaryTargetId = validTargetIds[0];
		const batchRef = `BATCH${targetType}${Date.now()}`;

		// Generate unique txnRef with batch info
		const txnRef = `${batchRef}${primaryTargetId}`;

		// Create single payment transaction for batch
		const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

		const payment = this.paymentRepository.create({
			txnRef,
			targetType,
			targetId: primaryTargetId, // Store first ID
			accountId,
			amount: totalAmount,
			currency: "VND",
			paymentMethod,
			status: PaymentStatus.PENDING,
			description: `Thanh toan nhieu ${targetType.toLowerCase()} - ${validTargetIds.length} items`,
			expiresAt,
			retryCount: 0,
			// Store all IDs in raw log for webhook handling
			rawLog: { batchIds: validTargetIds, allTargetIds: validTargetIds },
		});

		const savedPayment = await this.paymentRepository.save(payment);

		// Generate payment URL based on gateway
		let paymentUrl: string;

		// Determine redirect URL based on device type
		let finalRedirectUrl: string;
		if (redirectUrl && !redirectUrl.startsWith("emerald://")) {
			finalRedirectUrl = redirectUrl;
		} else if (
			deviceType === "mobile" ||
			deviceType === "ios" ||
			deviceType === "android"
		) {
			const mobileRedirectUrl = process.env.MOBILE_APP_REDIRECT_URL;
			if (!mobileRedirectUrl) {
				throw new BadRequestException(
					"Mobile app redirect URL not configured. Please contact support.",
				);
			}
			finalRedirectUrl = mobileRedirectUrl;
		} else {
			finalRedirectUrl = `${process.env.FRONTEND_URL}/payments/result?source=gateway`;
		}

		try {
			if (paymentMethod === PaymentGateway.MOMO) {
				if (!this.momoService.isAvailable()) {
					throw new BadRequestException(
						"Cổng thanh toán MoMo chưa được cấu hình. Vui lòng sử dụng VNPay hoặc liên hệ quản trị viên.",
					);
				}
				const momoResult = await this.momoService.createPayment({
					orderId: txnRef,
					amount: totalAmount,
					orderInfo: `Thanh toan ${validTargetIds.length} items`,
					redirectUrl: finalRedirectUrl,
					ipnUrl: `${process.env.BACKEND_URL}/api/v1/payments/webhook/momo`,
					requestId: `${txnRef}_${Date.now()}`,
				});
				paymentUrl = momoResult.payUrl;
			} else if (paymentMethod === PaymentGateway.VNPAY) {
				const ipnUrl = `${process.env.BACKEND_URL}/api/v1/payments/webhook/vnpay`;
				const vnpayResult = this.vnpayService.createPayment({
					orderId: txnRef,
					amount: totalAmount,
					orderInfo: `Thanh toan ${validTargetIds.length} items`,
					returnUrl: finalRedirectUrl,
					ipnUrl: ipnUrl,
					ipAddr: "127.0.0.1",
				});
				paymentUrl = vnpayResult.payUrl;
			} else {
				throw new BadRequestException("Payment gateway không được hỗ trợ");
			}

			// Update payment with URL
			savedPayment.paymentUrl = paymentUrl;
			await this.paymentRepository.save(savedPayment);

			return {
				transactionId: savedPayment.id,
				txnRef: savedPayment.txnRef,
				paymentUrl,
				amount: savedPayment.amount,
				expiresAt: savedPayment.expiresAt,
				batchIds: validTargetIds,
				itemCount: validTargetIds.length,
			};
		} catch (error) {
			// Update payment status to FAILED
			savedPayment.status = PaymentStatus.FAILED;
			savedPayment.rawLog = { error: error.message };
			await this.paymentRepository.save(savedPayment);

			throw new HttpException(
				`Tạo link thanh toán thất bại: ${error.message}`,
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}
	}

	async findOne(id: number) {
		const payment = await this.paymentRepository.findOne({
			where: { id },
		});

		if (!payment) {
			throw new NotFoundException("Giao dịch không tồn tại");
		}

		return payment;
	}

	async findByTxnRef(txnRef: string) {
		const payment = await this.paymentRepository.findOne({
			where: { txnRef },
		});

		if (!payment) {
			throw new NotFoundException("Giao dịch không tồn tại");
		}

		return payment;
	}

	async findByInvoice(invoiceId: number) {
		return this.paymentRepository.find({
			where: {
				targetType: PaymentTargetType.INVOICE,
				targetId: invoiceId,
			},
			order: { createdAt: "DESC" },
		});
	}

	async findByBooking(bookingId: number) {
		return this.paymentRepository.find({
			where: {
				targetType: PaymentTargetType.BOOKING,
				targetId: bookingId,
			},
			order: { createdAt: "DESC" },
		});
	}

	async handleMoMoWebhook(data: any) {
		// Deep clone to avoid modifying original data
		const dataCopy = { ...data };

		// Verify signature
		const isValid = this.momoService.verifySignature(dataCopy);
		if (!isValid) {
			throw new BadRequestException("Invalid signature");
		}

		const { orderId, resultCode, transId, message, responseTime } = data;

		const payment = await this.paymentRepository.findOne({
			where: { txnRef: orderId },
		});

		if (!payment) {
			throw new NotFoundException("Payment not found");
		}

		// Update payment (preserve existing batchIds in rawLog)
		payment.gatewayTxnId = transId;
		payment.gatewayResponseCode = String(resultCode);
		payment.rawLog = {
			...payment.rawLog, // Preserve existing batchIds
			...data, // Add webhook response data
		};
		payment.updatedAt = new Date();

		if (resultCode === 0) {
			payment.status = PaymentStatus.SUCCESS;
			payment.payDate = new Date(responseTime);
			await this.paymentRepository.save(payment);

			// Update target status
			await this.updateTargetStatus(payment);
		} else {
			payment.status = PaymentStatus.FAILED;
			await this.paymentRepository.save(payment);
		}

		return { message: "Webhook processed successfully" };
	}

	async handleVNPayWebhook(data: any) {
		// Deep clone to avoid modifying original data
		const dataCopy = { ...data };

		console.log("[VNPay Webhook] Received:", {
			vnp_TxnRef: data.vnp_TxnRef,
			vnp_ResponseCode: data.vnp_ResponseCode,
			vnp_Amount: data.vnp_Amount,
		});

		// Verify signature
		const isValid = this.vnpayService.verifySignature(dataCopy);
		console.log("[VNPay Webhook] Signature valid:", isValid);

		if (!isValid) {
			console.error("[VNPay Webhook] Signature verification failed");
			throw new BadRequestException("Invalid signature");
		}

		const { vnp_TxnRef, vnp_ResponseCode, vnp_TransactionNo, vnp_PayDate } =
			data;

		console.log("[VNPay Webhook] Looking for payment:", vnp_TxnRef);

		const payment = await this.paymentRepository.findOne({
			where: { txnRef: vnp_TxnRef },
		});

		if (!payment) {
			console.error("[VNPay Webhook] Payment not found:", vnp_TxnRef);
			throw new NotFoundException("Payment not found");
		}

		console.log("[VNPay Webhook] Found payment:", {
			id: payment.id,
			txnRef: payment.txnRef,
			currentStatus: payment.status,
		});

		// Update payment (preserve existing batchIds in rawLog)
		payment.gatewayTxnId = vnp_TransactionNo;
		payment.gatewayResponseCode = vnp_ResponseCode;
		payment.rawLog = {
			...payment.rawLog, // Preserve existing batchIds
			...data, // Add webhook response data
		};
		payment.updatedAt = new Date();

		if (vnp_ResponseCode === "00") {
			payment.status = PaymentStatus.SUCCESS;
			payment.payDate = this.parseVNPayDate(vnp_PayDate);
			await this.paymentRepository.save(payment);

			console.log("[VNPay Webhook] Payment marked SUCCESS:", payment.id);

			// Update target status (handles both single and batch)
			await this.updateTargetStatus(payment);

			// Extract batch IDs if available
			const batchIds = (payment.rawLog as any)?.batchIds;
			const updatedIds = batchIds || [payment.targetId];

			console.log("[VNPay Webhook] Target status updated:", {
				targetType: payment.targetType,
				updatedIds: updatedIds,
				isBatch: !!batchIds,
			});
		} else {
			payment.status = PaymentStatus.FAILED;
			await this.paymentRepository.save(payment);
			console.log("[VNPay Webhook] Payment marked FAILED:", payment.id);
		}

		return { message: "Webhook processed successfully" };
	}

	private async updateTargetStatus(payment: PaymentTransaction) {
		// Handle batch payments
		const batchIds = (payment.rawLog as any)?.batchIds;
		const targetIds = batchIds || [payment.targetId];

		console.log("[VNPay Webhook] Updating batch IDs:", targetIds);

		if (payment.targetType === PaymentTargetType.INVOICE) {
			// Update all batch invoice IDs
			const result = await this.invoiceRepository.update(
				{ id: In(targetIds) },
				{ status: InvoiceStatus.PAID },
			);
			console.log("[VNPay Webhook] Invoice update result:", {
				affected: result.affected,
				ids: targetIds,
			});
		} else if (payment.targetType === PaymentTargetType.BOOKING) {
			// Update all batch booking IDs
			const result = await this.bookingRepository.update(
				{ id: In(targetIds) },
				{ status: BookingStatus.PAID },
			);
			console.log("[VNPay Webhook] Booking update result:", {
				affected: result.affected,
				ids: targetIds,
			});
		}
	}

	private generateTxnRef(
		targetType: PaymentTargetType,
		targetId: number,
	): string {
		const prefix = targetType === PaymentTargetType.INVOICE ? "INV" : "BKG";
		const timestamp = Date.now();
		return `${prefix}${targetId}${timestamp}`;
	}

	private parseVNPayDate(vnpPayDate: string): Date {
		// Format: yyyyMMddHHmmss
		const year = parseInt(vnpPayDate.substring(0, 4));
		const month = parseInt(vnpPayDate.substring(4, 6)) - 1;
		const day = parseInt(vnpPayDate.substring(6, 8));
		const hour = parseInt(vnpPayDate.substring(8, 10));
		const minute = parseInt(vnpPayDate.substring(10, 12));
		const second = parseInt(vnpPayDate.substring(12, 14));
		return new Date(year, month, day, hour, minute, second);
	}

	/**
	 * [Cron Job] Cleanup expired pending payments (after 15 minutes)
	 * Runs every hour
	 */
	@Cron(CronExpression.EVERY_HOUR)
	async cleanupExpiredPayments() {
		const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

		const result = await this.paymentRepository.update(
			{
				status: PaymentStatus.PENDING,
				createdAt: LessThan(fifteenMinutesAgo),
			},
			{ status: PaymentStatus.FAILED },
		);

		if (result.affected && result.affected > 0) {
			console.log(
				`✅ [PaymentCleanup] Marked ${result.affected} expired payments as FAILED`,
			);
		}

		return { affected: result.affected || 0 };
	}
}
