import { ApiProperty } from "@nestjs/swagger";
import {
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsPositive,
	IsString,
} from "class-validator";
import { PaymentGateway } from "../enums/payment-gateway.enum";
import { PaymentTargetType } from "../enums/payment-target-type.enum";

export class CreatePaymentDto {
	@ApiProperty({
		enum: PaymentTargetType,
		example: PaymentTargetType.INVOICE,
		description: "Type of target (INVOICE or BOOKING)",
	})
	@IsEnum(PaymentTargetType)
	@IsNotEmpty()
	targetType: PaymentTargetType;

	@ApiProperty({
		example: 1,
		description: "ID of the invoice or booking",
	})
	@IsInt()
	@IsPositive()
	@IsNotEmpty()
	targetId: number;

	@ApiProperty({
		enum: PaymentGateway,
		example: PaymentGateway.MOMO,
		description: "Payment gateway to use (MOMO or VNPAY)",
	})
	@IsEnum(PaymentGateway)
	@IsNotEmpty()
	paymentMethod: PaymentGateway;

	@ApiProperty({
		enum: ["web", "mobile", "ios", "android"],
		example: "mobile",
		description: "Device type - for mobile, use custom deep link redirect",
		required: false,
	})
	@IsOptional()
	@IsString()
	deviceType?: "web" | "mobile" | "ios" | "android";

	@ApiProperty({
		example: "emerald://payments/result?txnRef=INV1123456",
		description: "Custom redirect URL (mobile deep link or web URL)",
		required: false,
	})
	@IsOptional()
	@IsString()
	redirectUrl?: string;
}
