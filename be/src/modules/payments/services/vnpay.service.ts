import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";

export interface VNPayPaymentRequest {
	orderId: string;
	amount: number;
	orderInfo: string;
	returnUrl: string;
	ipnUrl: string;
	ipAddr: string;
}

export interface VNPayPaymentResponse {
	payUrl: string;
}

@Injectable()
export class VNPayService {
	private readonly tmnCode: string;
	private readonly hashSecret: string;
	private readonly endpoint: string;

	constructor() {
		this.tmnCode = process.env.VNPAY_TMN_CODE || "";
		this.hashSecret = process.env.VNPAY_HASH_SECRET || "";
		this.endpoint =
			process.env.VNPAY_ENDPOINT ||
			"https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
	}

	createPayment(request: VNPayPaymentRequest): VNPayPaymentResponse {
		const { orderId, amount, orderInfo, returnUrl, ipAddr } = request;

		const createDate = this.formatDateInVnTimezone(new Date());
		const expireDate = this.formatDateInVnTimezone(
			new Date(Date.now() + 15 * 60 * 1000),
		); // 15 minutes

		let vnpParams: any = {
			vnp_Version: "2.1.0",
			vnp_Command: "pay",
			vnp_TmnCode: this.tmnCode,
			vnp_Locale: "vn",
			vnp_CurrCode: "VND",
			vnp_TxnRef: orderId,
			vnp_OrderInfo: orderInfo,
			vnp_OrderType: "other",
			vnp_Amount: Math.round(amount * 100), // VNPay requires an integer amount in VND * 100.
			vnp_ReturnUrl: returnUrl,
			vnp_IpAddr: ipAddr,
			vnp_CreateDate: createDate,
			vnp_ExpireDate: expireDate,
		};

		// Sort and encode params following VNPay's Node.js demo.
		vnpParams = this.sortObject(vnpParams);

		const signData = this.stringifyParams(vnpParams);
		const hmac = crypto.createHmac("sha512", this.hashSecret);
		const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

		const payUrl = `${this.endpoint}?${signData}&vnp_SecureHash=${signed}`;

		return { payUrl };
	}

	verifySignature(vnpParams: any): boolean {
		// Deep clone to avoid modifying original
		const params = { ...vnpParams };

		const secureHash = params.vnp_SecureHash;
		delete params.vnp_SecureHash;
		delete params.vnp_SecureHashType;

		const sortedParams = this.sortObject(params);

		const signData = this.stringifyParams(sortedParams);

		const hmac = crypto.createHmac("sha512", this.hashSecret);
		const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

		return secureHash === signed;
	}

	private sortObject(obj: any): any {
		const sorted: any = {};
		const keys = Object.keys(obj)
			.map((key) => encodeURIComponent(key))
			.sort();

		for (const encodedKey of keys) {
			const rawValue = obj[encodedKey] ?? obj[decodeURIComponent(encodedKey)];
			sorted[encodedKey] = encodeURIComponent(String(rawValue)).replace(
				/%20/g,
				"+",
			);
		}
		return sorted;
	}

	private stringifyParams(params: Record<string, string>): string {
		return Object.entries(params)
			.map(([key, value]) => `${key}=${value}`)
			.join("&");
	}

	private formatDateInVnTimezone(date: Date): string {
		// VNPay expects timestamps in GMT+7 (Vietnam time).
		const vnOffsetMs = 7 * 60 * 60 * 1000;
		const vnDate = new Date(date.getTime() + vnOffsetMs);

		const year = vnDate.getUTCFullYear();
		const month = String(vnDate.getUTCMonth() + 1).padStart(2, "0");
		const day = String(vnDate.getUTCDate()).padStart(2, "0");
		const hours = String(vnDate.getUTCHours()).padStart(2, "0");
		const minutes = String(vnDate.getUTCMinutes()).padStart(2, "0");
		const seconds = String(vnDate.getUTCSeconds()).padStart(2, "0");
		return `${year}${month}${day}${hours}${minutes}${seconds}`;
	}
}
