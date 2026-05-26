import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsString, ValidateIf } from "class-validator";

/**
 * MoMo Webhook DTO
 * NOTE: When copying from MoMo redirect URL, you must URL-decode the orderInfo and message fields
 * Examples:
 *   URL-encoded: orderInfo=Thanh+to%C3%A1n+h%C3%B3a+%C4%91%C6%A1n
 *   Decoded: orderInfo=Thanh toán hóa đơn
 *
 * You can use: console.log(decodeURIComponent(encodeURIComponent(encodedString)))
 */
export class MoMoWebhookDto {
	@ApiProperty({
		example: "MOMO",
		description: "MoMo partner code",
	})
	@IsString()
	@IsNotEmpty()
	partnerCode: string;

	@ApiProperty({
		example: "INV11768445052607",
		description: "Order ID (same as txnRef)",
	})
	@IsString()
	@IsNotEmpty()
	orderId: string;

	@ApiProperty({
		example: "INV11768445052607_1768445052818",
		description: "Request ID",
	})
	@IsString()
	@IsNotEmpty()
	requestId: string;

	@ApiProperty({
		example: 4252270,
		description: "Payment amount in VND",
	})
	@IsNumber()
	@IsNotEmpty()
	amount: number;

	@ApiProperty({
		example: "Thanh toan hoa don INV-202401-AA-10.01",
		description:
			"Order info (MUST be URL-decoded from redirect URL, should be ASCII format without Vietnamese diacritics)",
	})
	@IsString()
	@IsNotEmpty()
	orderInfo: string;

	@ApiProperty({
		example: "momo_wallet",
		description: "Order type",
	})
	@IsString()
	@IsNotEmpty()
	orderType: string;

	@ApiProperty({
		example: 4650111183,
		description: "MoMo transaction ID (can be number or string)",
	})
	@IsNotEmpty()
	@ValidateIf((o) => o.transId !== null && o.transId !== undefined)
	transId: number | string;

	@ApiProperty({
		example: 0,
		description: "Result code (0 = success)",
	})
	@IsNumber()
	@IsNotEmpty()
	resultCode: number;

	@ApiProperty({
		example: "Thanh cong.",
		description:
			"Result message (MUST be URL-decoded from redirect URL, should be ASCII format)",
	})
	@IsString()
	@IsNotEmpty()
	message: string;

	@ApiProperty({
		example: "qr",
		description: "Payment type (qr, wallet, etc)",
	})
	@IsString()
	@IsNotEmpty()
	payType: string;

	@ApiProperty({
		example: 1768445892538,
		description: "Response time (Unix timestamp in milliseconds)",
	})
	@IsNumber()
	@IsNotEmpty()
	responseTime: number;

	@ApiProperty({
		example: "",
		description: "Extra data (usually empty)",
		required: false,
	})
	@IsString()
	@ValidateIf(
		(o) =>
			o.extraData !== undefined && o.extraData !== null && o.extraData !== "",
	)
	extraData?: string;

	@ApiProperty({
		example: "5bf3f0df9c5d4d54a211a385c363d0c0e6d6e1c05b13c8cf1d929a5d758a5ade",
		description: "Signature from MoMo for verification",
	})
	@IsString()
	@IsNotEmpty()
	signature: string;
}
