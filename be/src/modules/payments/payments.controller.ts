/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/require-await */
import {
	BadRequestException,
	Body,
	ClassSerializerInterceptor,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseIntPipe,
	Post,
	Query,
	Response,
	UseGuards,
	UseInterceptors,
} from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from "@nestjs/swagger";
import { plainToInstance } from "class-transformer";
import { ApiDoc } from "../../decorators/api-doc.decorator";
import { CurrentUser } from "../../decorators/user.decorator";
import { AuthGuard } from "../../guards/auth.guard";
import { TransformInterceptor } from "../../interceptors/transform.interceptor";
import { CreateBatchPaymentDto } from "./dto/create-batch-payment.dto";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { CreatePaymentResponseDto } from "./dto/create-payment-response.dto";
import { MoMoWebhookDto } from "./dto/momo-webhook.dto";
import { PaymentResponseDto } from "./dto/payment-response.dto";
import { PaymentsService } from "./payments.service";

@ApiTags("Payments")
@ApiBearerAuth()
@Controller("payments")
@UseInterceptors(ClassSerializerInterceptor, TransformInterceptor)
export class PaymentsController {
	constructor(private readonly paymentsService: PaymentsService) {}

	@Post()
	@UseGuards(AuthGuard)
	@HttpCode(HttpStatus.CREATED)
	@ApiDoc({
		summary: "Tạo link thanh toán",
		description:
			"Tạo giao dịch thanh toán và nhận link redirect tới MoMo hoặc VNPay",
	})
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: "Payment link created successfully",
		type: CreatePaymentResponseDto,
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: "Invalid input or target already paid",
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: "Invoice or booking not found",
	})
	async create(
		@CurrentUser("id") accountId: number,
		@Body() createPaymentDto: CreatePaymentDto,
	) {
		const payment = await this.paymentsService.createPayment(
			accountId,
			createPaymentDto,
		);
		return plainToInstance(CreatePaymentResponseDto, payment);
	}

	@Post("batch")
	@UseGuards(AuthGuard)
	@HttpCode(HttpStatus.CREATED)
	@ApiDoc({
		summary: "Tạo link thanh toán batch",
		description:
			"Tạo giao dịch thanh toán cho nhiều hóa đơn/booking cùng lúc và nhận link redirect tới MoMo hoặc VNPay",
	})
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: "Batch payment link created successfully",
		type: CreatePaymentResponseDto,
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: "Invalid input or targets already paid",
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: "Invoices or bookings not found",
	})
	async createBatch(
		@CurrentUser("id") accountId: number,
		@Body() createBatchPaymentDto: CreateBatchPaymentDto,
	) {
		const { targetType, targetIds, paymentMethod, deviceType, redirectUrl } =
			createBatchPaymentDto;

		const payment = await this.paymentsService.createBatchPayment(
			accountId,
			targetType,
			targetIds,
			paymentMethod,
			deviceType,
			redirectUrl,
		);

		return plainToInstance(CreatePaymentResponseDto, payment);
	}

	@Get(":id")
	@UseGuards(AuthGuard)
	@HttpCode(HttpStatus.OK)
	@ApiDoc({
		summary: "Lấy thông tin giao dịch",
		description: "Lấy chi tiết giao dịch thanh toán theo ID",
	})
	@ApiParam({
		name: "id",
		description: "Payment transaction ID",
		type: Number,
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Payment details retrieved successfully",
		type: PaymentResponseDto,
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: "Payment not found",
	})
	async findOne(@Param("id", ParseIntPipe) id: number) {
		const payment = await this.paymentsService.findOne(id);
		return plainToInstance(PaymentResponseDto, payment);
	}

	@Get("txn-ref/:txnRef")
	@UseGuards(AuthGuard)
	@HttpCode(HttpStatus.OK)
	@ApiDoc({
		summary: "Lấy thông tin giao dịch theo mã tham chiếu",
		description: "Lấy chi tiết giao dịch thanh toán theo txnRef",
	})
	@ApiParam({
		name: "txnRef",
		description: "Transaction reference code",
		type: String,
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Payment details retrieved successfully",
		type: PaymentResponseDto,
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: "Payment not found",
	})
	async findByTxnRef(@Param("txnRef") txnRef: string) {
		const payment = await this.paymentsService.findByTxnRef(txnRef);
		return plainToInstance(PaymentResponseDto, payment);
	}

	@Get("invoice/:invoiceId")
	@UseGuards(AuthGuard)
	@HttpCode(HttpStatus.OK)
	@ApiDoc({
		summary: "Lấy danh sách giao dịch của hóa đơn",
		description: "Lấy tất cả giao dịch thanh toán của một hóa đơn",
	})
	@ApiParam({
		name: "invoiceId",
		description: "Invoice ID",
		type: Number,
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Payment list retrieved successfully",
		type: [PaymentResponseDto],
	})
	async findByInvoice(@Param("invoiceId", ParseIntPipe) invoiceId: number) {
		const payments = await this.paymentsService.findByInvoice(invoiceId);
		return payments.map((p) => plainToInstance(PaymentResponseDto, p));
	}

	@Get("booking/:bookingId")
	@UseGuards(AuthGuard)
	@HttpCode(HttpStatus.OK)
	@ApiDoc({
		summary: "Lấy danh sách giao dịch của booking",
		description: "Lấy tất cả giao dịch thanh toán của một booking",
	})
	@ApiParam({
		name: "bookingId",
		description: "Booking ID",
		type: Number,
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Payment list retrieved successfully",
		type: [PaymentResponseDto],
	})
	async findByBooking(@Param("bookingId", ParseIntPipe) bookingId: number) {
		const payments = await this.paymentsService.findByBooking(bookingId);
		return payments.map((p) => plainToInstance(PaymentResponseDto, p));
	}

	@Post("webhook/momo")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "MoMo IPN Webhook - Test Payment Callback",
		description:
			"Xử lý callback từ MoMo sau khi thanh toán. MoMo gửi JSON body với thông tin thanh toán. LƯU Ý: Khi copy từ redirect URL, phải URL-decode orderInfo và message",
	})
	@ApiBody({
		type: MoMoWebhookDto,
		description: "MoMo Webhook Payload (URL-decoded)",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Webhook processed successfully",
		schema: {
			example: {
				message: "Webhook processed successfully",
			},
		},
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: "Signature verification failed or payment not found",
	})
	async momoWebhook(@Body() body: MoMoWebhookDto) {
		return this.paymentsService.handleMoMoWebhook(body);
	}

	@Get("mobile-callback")
	@HttpCode(HttpStatus.FOUND)
	async mobileCallback(@Query() query: any, @Response() res: any) {
		// VNPay will redirect here with its params in the query string
		// Extract txnRef from VNPay params
		const txnRef = query.vnp_TxnRef || query.txnRef;

		console.log("[Mobile Callback] Received VNPay redirect:", {
			txnRef,
			responseCode: query.vnp_ResponseCode,
			amount: query.vnp_Amount,
			allParams: Object.keys(query),
		});

		if (!txnRef) {
			console.error("[Mobile Callback] ❌ Missing txnRef:", query);
			// Redirect to error page if no txnRef
			const errorDeepLink =
				"emerald://payment-result?status=failed&source=gateway";
			return res.redirect(errorDeepLink);
		}

		// Determine payment status from VNPay response code
		const responseCode = query.vnp_ResponseCode || "00";
		const isSuccess = responseCode === "00"; // '00' = thành công
		const status = isSuccess ? "processing" : "failed";

		// Build deep link
		const deepLink = `emerald://payment-result?txnRef=${encodeURIComponent(txnRef)}&source=gateway&status=${status}`;

		console.log("[Mobile Callback] ✅ Redirecting to deep link:", deepLink);

		// Return 302 redirect to deep link
		// This is native browser redirect, ngrok won't block it
		res.redirect(302, deepLink);
	}

	@Get("webhook/vnpay")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "VNPay IPN Webhook - Test Payment Callback",
		description:
			"Xử lý callback từ VNPay sau khi thanh toán. Dùng để test, copy toàn bộ query params từ URL VNPay return.",
	})
	@ApiQuery({
		name: "vnp_Amount",
		type: String,
		description: "Số tiền thanh toán",
		required: true,
		example: "763557000",
	})
	@ApiQuery({
		name: "vnp_BankCode",
		type: String,
		description: "Mã ngân hàng",
		required: false,
		example: "NCB",
	})
	@ApiQuery({
		name: "vnp_BankTranNo",
		type: String,
		description: "Mã giao dịch ngân hàng",
		required: false,
		example: "VNP15396667",
	})
	@ApiQuery({
		name: "vnp_CardType",
		type: String,
		description: "Loại thẻ",
		required: false,
		example: "ATM",
	})
	@ApiQuery({
		name: "vnp_OrderInfo",
		type: String,
		description: "Thông tin đơn hàng",
		required: false,
		example: "Thanh toan hoa don INV-202401-AA.12-01",
	})
	@ApiQuery({
		name: "vnp_PayDate",
		type: String,
		description: "Ngày thanh toán (YYYYMMDDHHMMSS)",
		required: false,
		example: "20260114231049",
	})
	@ApiQuery({
		name: "vnp_ResponseCode",
		type: String,
		description: "Mã phản hồi (00=thành công)",
		required: true,
		example: "00",
	})
	@ApiQuery({
		name: "vnp_TmnCode",
		type: String,
		description: "Mã đơn vị tiếp nhận",
		required: true,
		example: "XISGGWC4",
	})
	@ApiQuery({
		name: "vnp_TransactionNo",
		type: String,
		description: "Mã giao dịch VNPay",
		required: false,
		example: "15396667",
	})
	@ApiQuery({
		name: "vnp_TransactionStatus",
		type: String,
		description: "Trạng thái giao dịch",
		required: false,
		example: "00",
	})
	@ApiQuery({
		name: "vnp_TxnRef",
		type: String,
		description: "Mã tham chiếu từ hệ thống (VD: INV21768407018995)",
		required: true,
		example: "INV21768407018995",
	})
	@ApiQuery({
		name: "vnp_SecureHash",
		type: String,
		description: "Mã xác thực HMAC-SHA512",
		required: true,
		example:
			"82e9b1f3d71e551892219e89fa5987ba8addaa4c78108d5f0ba8493123135c8ae59ad4dd3242acb12acae77e4c4ad6382cacff5a83d2845ec4bedad577975d66",
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: "Webhook processed successfully",
		schema: {
			example: {
				statusCode: 200,
				message: "Payment verified and processed successfully",
				data: {
					transactionId: 2,
					txnRef: "INV21768407018995",
					status: "SUCCESS",
					amount: 763557000,
					paymentMethod: "VNPAY",
					gatewayTxnId: "15396667",
					payDate: "2026-01-14T23:10:49.000Z",
				},
			},
		},
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: "Signature verification failed or payment not found",
	})
	async vnpayWebhook(@Query() query: any) {
		return this.paymentsService.handleVNPayWebhook(query);
	}
}
