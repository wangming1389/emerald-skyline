import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, CreditCard } from "lucide-react-native";
import { useState } from "react";
import {
	ActivityIndicator,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MomoIcon from "@/assets/images/momo-icon";
import VNPayIcon from "@/assets/images/vnpay-icon";
import MyButton from "@/components/ui/Button";
import { CustomHeader } from "@/components/ui/CustomHeader";
import { createBatchPayment, createPayment } from "@/services/payment.service";

type PaymentMethod = "vnpay" | "momo";

export default function PaymentMethodScreen() {
	const router = useRouter();
	const params = useLocalSearchParams();

	const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim()?.replace(
		/\/$/,
		"",
	);
	const mobileGatewayRedirectUrl = apiBaseUrl
		? `${apiBaseUrl}/payments/mobile-callback`
		: undefined;

	console.log("🔍 [PaymentMethod] Raw params received:", params);

	const totalAmount = params.amount ? Number(params.amount as string) : 0;

	// Robust invoiceIds parsing with detailed error handling
	const invoiceIds = (() => {
		try {
			if (!params.invoiceIds) {
				console.warn("⚠️  params.invoiceIds is undefined/null");
				return [];
			}

			const rawValue = params.invoiceIds as string;
			console.log("🔍 Parsing invoiceIds:", {
				raw: rawValue,
				type: typeof rawValue,
				length: rawValue.length,
			});

			const parsed = JSON.parse(rawValue);
			console.log("🔍 After JSON.parse:", {
				value: parsed,
				type: typeof parsed,
				isArray: Array.isArray(parsed),
				length: Array.isArray(parsed) ? parsed.length : "N/A",
			});

			if (!Array.isArray(parsed)) {
				console.error(
					"❌ JSON.parse succeeded but result is not an array:",
					parsed,
				);
				return [];
			}

			if (parsed.length === 0) {
				console.warn("⚠️  invoiceIds array is empty after parsing");
				return [];
			}

			// Convert all IDs to numbers (defensive: backend might send strings)
			const convertedIds = parsed
				.map((id) => {
					const numId = Number(id);
					if (isNaN(numId) || numId <= 0) {
						console.warn("⚠️  Invalid ID after conversion:", {
							original: id,
							converted: numId,
						});
						return null;
					}
					return numId;
				})
				.filter((id) => id !== null);

			if (convertedIds.length === 0) {
				console.error("❌ No valid IDs after conversion");
				return [];
			}

			console.log("✅ invoiceIds parsed and converted successfully:", {
				original: parsed,
				converted: convertedIds,
				types: convertedIds.map((id) => typeof id),
			});
			return convertedIds;
		} catch (error) {
			console.error("❌ Failed to parse invoiceIds:", {
				error,
				raw: params.invoiceIds,
				type: typeof params.invoiceIds,
			});
			return [];
		}
	})();

	const bookingId = params.bookingId
		? Number(params.bookingId as string)
		: null;
	const targetType = ((params.targetType as string) || "INVOICE") as
		| "INVOICE"
		| "BOOKING";

	// Debug logging
	console.log("🔍 [PaymentMethod] After parsing:", {
		totalAmount,
		invoiceIds,
		bookingId,
		targetType,
		invoiceIdsType: typeof invoiceIds,
		invoiceIdsIsArray: Array.isArray(invoiceIds),
		invoiceIdsLength: invoiceIds.length,
	});

	const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("vnpay");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleConfirmPayment = async () => {
		if (!selectedMethod) {
			setError("Vui lòng chọn phương thức thanh toán");
			return;
		}

		if (totalAmount <= 0) {
			setError("Số tiền thanh toán không hợp lệ");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			// Validate target carefully
			let targetId: number | null = null;

			console.log("========== VALIDATION START ==========");
			console.log("🔍 State check:", {
				targetType,
				invoiceIds: invoiceIds,
				invoiceIdsLength: invoiceIds.length,
				bookingId,
			});

			if (targetType === "INVOICE") {
				console.log("📦 Processing INVOICE type");
				// Check if invoiceIds is valid array
				if (!Array.isArray(invoiceIds)) {
					console.error("❌ invoiceIds is not an array!", {
						value: invoiceIds,
						type: typeof invoiceIds,
					});
					setError(`❌ Lỗi: invoiceIds không phải mảng (${typeof invoiceIds})`);
					setIsLoading(false);
					return;
				}

				if (invoiceIds.length === 0) {
					console.error("❌ invoiceIds array is EMPTY!");
					setError("❌ Vui lòng chọn ít nhất 1 hóa đơn để thanh toán");
					setIsLoading(false);
					return;
				}

				const firstId = invoiceIds[0];
				console.log("🔍 First invoice ID:", {
					value: firstId,
					type: typeof firstId,
					raw: invoiceIds,
				});

				// Convert to number in case backend sent strings
				const numFirstId = Number(firstId);

				if (isNaN(numFirstId) || numFirstId <= 0) {
					console.error("❌ Invalid invoice ID:", {
						firstId,
						converted: numFirstId,
						isNaN: isNaN(numFirstId),
					});
					setError(`❌ ID hóa đơn không hợp lệ: ${firstId}`);
					setIsLoading(false);
					return;
				}

				targetId = numFirstId;
				console.log("✅ INVOICE validation passed:", {
					targetId,
					originalId: firstId,
				});
			} else if (targetType === "BOOKING") {
				console.log("📦 Processing BOOKING type");
				if (!bookingId || bookingId <= 0) {
					console.error("❌ Invalid bookingId:", bookingId);
					setError("❌ Không tìm thấy thông tin booking");
					setIsLoading(false);
					return;
				}
				targetId = bookingId;
				console.log("✅ BOOKING validation passed:", { targetId });
			} else {
				console.error("❌ Invalid targetType:", targetType);
				setError("❌ Loại thanh toán không hợp lệ");
				setIsLoading(false);
				return;
			}

			if (!targetId || targetId <= 0) {
				console.error("❌ Final targetId check failed:", {
					targetId,
					isInteger: Number.isInteger(targetId),
				});
				setError("❌ Thông tin thanh toán không hợp lệ");
				setIsLoading(false);
				return;
			}

			console.log("✅ ALL VALIDATION PASSED");
			console.log("✅ Creating payment:", {
				targetType,
				targetId,
				invoiceIdsLength: invoiceIds.length,
				paymentMethod: selectedMethod.toUpperCase(),
				amount: totalAmount,
			});

			// ✅ CREATE PAYMENT API CALL
			let paymentResponse;

			// Use batch API if multiple invoices, single API for single or booking
			if (targetType === "INVOICE" && invoiceIds.length > 1) {
				console.log("📦 Using BATCH API for", invoiceIds.length, "invoices");
				paymentResponse = await createBatchPayment({
					targetType: "INVOICE",
					targetIds: invoiceIds,
					paymentMethod: selectedMethod.toUpperCase() as "MOMO" | "VNPAY",
					deviceType: "mobile",
					redirectUrl: mobileGatewayRedirectUrl,
				});
			} else {
				console.log("📦 Using SINGLE API for 1 item");
				paymentResponse = await createPayment({
					targetType: targetType === "INVOICE" ? "INVOICE" : "BOOKING",
					targetId: Number(targetId),
					paymentMethod: selectedMethod.toUpperCase() as "MOMO" | "VNPAY",
					deviceType: "mobile",
					redirectUrl: mobileGatewayRedirectUrl,
				});
			}

			console.log("✅ Payment created successfully:", paymentResponse);

			if (!paymentResponse.paymentUrl) {
				console.error("❌ paymentUrl is missing in response:", paymentResponse);
				setError("❌ Không thể tạo link thanh toán");
				setIsLoading(false);
				return;
			}

			// Lưu txnRef để tracking
			const txnRef = paymentResponse.txnRef;

			console.log("✅ Redirecting to processing screen:", {
				txnRef,
				paymentUrl: paymentResponse.paymentUrl,
			});

			// Chuyển sang trang tracking
			router.push({
				pathname: "/payment/processing",
				params: {
					txnRef,
					paymentUrl: encodeURIComponent(paymentResponse.paymentUrl),
					amount: String(Math.round(totalAmount)),
					paymentMethod: selectedMethod,
					targetType,
					targetId: String(targetId),
				},
			});
		} catch (err: any) {
			console.error("❌ Lỗi tạo giao dịch thanh toán:", {
				error: err,
				message: err?.message,
				response: err?.response?.data,
				status: err?.response?.status,
			});
			const errorMessage =
				err?.response?.data?.message ||
				err?.message ||
				"❌ Không thể tạo giao dịch thanh toán. Vui lòng thử lại";
			setError(errorMessage);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<SafeAreaView className="flex-1 bg-[#F3F4F6]">
			<CustomHeader
				title="Thanh toán"
				showBackButton
				backgroundColor="#F3F4F6"
			/>

			<ScrollView
				className="flex-1 px-4 pt-2"
				showsVerticalScrollIndicator={false}
			>
				{/* Amount Display */}
				<View className="bg-main p-6 rounded-2xl items-center shadow-sm mb-6">
					<Text className="text-gray-300 text-xs mb-2">
						Số tiền cần thanh toán
					</Text>
					<Text className="text-white text-3xl font-bold">
						{Math.round(totalAmount).toLocaleString("vi-VN")} đ
					</Text>
				</View>

				{/* Error Message */}
				{error && (
					<View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex-row items-start">
						<AlertCircle
							size={20}
							color="#DC2626"
							style={{ marginRight: 10 }}
						/>
						<Text className="flex-1 text-red-700 text-sm">{error}</Text>
					</View>
				)}

				<Text className="text-lg font-bold text-main mb-3">
					Chọn phương thức thanh toán
				</Text>

				{/* Phương thức thanh toán */}
				<View className="bg-white rounded-2xl p-4 shadow-sm">
					{/* Header Title */}
					<View className="flex-row items-center mb-4">
						<CreditCard size={18} color="#244B35" />
						<Text className="text-base font-bold text-gray-800 ml-2">
							Phương thức thanh toán
						</Text>
					</View>

					{/* VNPay Option */}
					<TouchableOpacity
						onPress={() => {
							setSelectedMethod("vnpay"); // Logic cũ: dùng string "vnpay"
							setError(null); // Logic cũ: reset error
						}}
						disabled={isLoading} // Logic cũ: disable khi loading
						className="bg-white p-4 rounded-xl mb-4 flex-row items-center border shadow-sm" // UI cũ: style gọn
						style={{
							borderColor: selectedMethod === "vnpay" ? "#E09B6B" : "#F3F4F6",
							opacity: isLoading ? 0.6 : 1, // Logic cũ: mờ đi khi loading
						}}
					>
						{/* UI Icon: w-10 h-10, không màu nền */}
						<View className="w-10 h-10 mr-3 items-center justify-center">
							<VNPayIcon width={30} height={30} />
						</View>

						<View>
							<Text className="font-bold text-base text-gray-800">VNPay</Text>
							<Text className="text-sm text-gray-400">
								Thanh toán bằng QR Code hoặc thẻ
							</Text>
						</View>
					</TouchableOpacity>

					{/* Momo Option */}
					<TouchableOpacity
						onPress={() => {
							setSelectedMethod("momo"); // Logic cũ: dùng string "momo"
							setError(null);
						}}
						disabled={isLoading}
						className="bg-white p-4 rounded-xl mb-6 flex-row items-center border shadow-sm"
						style={{
							borderColor: selectedMethod === "momo" ? "#E09B6B" : "#F3F4F6",
							opacity: isLoading ? 0.6 : 1,
						}}
					>
						{/* UI Icon: w-10 h-10, không màu nền */}
						<View className="w-10 h-10 mr-3 items-center justify-center">
							<MomoIcon width={30} height={30} />
						</View>

						<View>
							<Text className="font-bold text-base text-gray-800">Momo</Text>
							<Text className="text-sm text-gray-400">Ví điện tử Momo</Text>
						</View>
					</TouchableOpacity>
				</View>

				{/* Submit Button */}
				<MyButton
					variant="secondary"
					className="w-full h-12 shadow-md flex-row items-center justify-center"
					disabled={isLoading || totalAmount <= 0}
					onPress={handleConfirmPayment}
				>
					{isLoading ? (
						<>
							<ActivityIndicator color="white" size="small" />
							<Text className="text-white font-bold text-base ml-2">
								Đang xử lý...
							</Text>
						</>
					) : (
						<>
							<CreditCard size={20} color="white" style={{ marginRight: 8 }} />
							<Text className="text-white font-bold text-base">
								Xác nhận thanh toán
							</Text>
						</>
					)}
				</MyButton>

				{/* Info Section */}
				<View className="bg-blue-50 p-4 rounded-lg mt-6 mb-8">
					<Text className="text-xs font-semibold text-blue-900 mb-2">
						ℹ️ THÔNG TIN THANH TOÁN
					</Text>
					<Text className="text-xs text-blue-800 leading-5">
						• Khoảng 15 phút để xác nhận giao dịch{"\n"}• Không mất phí bổ sung
						{"\n"}• Thanh toán an toàn 100%
					</Text>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
