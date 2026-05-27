import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import MomoIcon from "@/assets/images/momo-icon";
import VNPayIcon from "@/assets/images/vnpay-icon";
import { CustomHeader } from "@/components/ui/CustomHeader";
import {
	PaymentStatusResponse,
	pollPaymentStatus,
} from "@/services/payment.service";
import { handlePaymentRedirect } from "@/utils/payment-redirect";

type PaymentProcessingStatus =
	| "initializing"
	| "waiting"
	| "success"
	| "failed"
	| "expired";

export default function PaymentProcessingScreen() {
	const router = useRouter();
	const params = useLocalSearchParams();

	const txnRef = (params.txnRef as string) || "";
	const rawPaymentUrl = (params.paymentUrl as string) || "";
	const paymentUrl = rawPaymentUrl.startsWith("http")
		? rawPaymentUrl
		: decodeURIComponent(rawPaymentUrl);
	const amount = params.amount ? Number(params.amount as string) : 0;
	const paymentMethod = ((params.paymentMethod as string) || "vnpay") as
		| "momo"
		| "vnpay";

	const [status, setStatus] = useState<PaymentProcessingStatus>("initializing");
	const [paymentData, setPaymentData] = useState<PaymentStatusResponse | null>(
		null,
	);
	const [timeRemaining, setTimeRemaining] = useState(300);
	const [isPolling, setIsPolling] = useState(false);

	// Use refs to avoid stale closures and memory leaks
	const isPollingRef = useRef(false);
	const isMountedRef = useRef(true);
	const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
	const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			timersRef.current.forEach(clearTimeout);
			intervalsRef.current.forEach(clearInterval);
			timersRef.current = [];
			intervalsRef.current = [];
		};
	}, []);

	// Listen for deep link from VNPay/MoMo redirect or custom handler
	useEffect(() => {
		const handleUrl = async ({ url }: { url: string }) => {
			if (!isMountedRef.current) return;

			console.log("[Processing] URL handler triggered:", url);

			try {
				// Close WebBrowser IMMEDIATELY when receiving redirect
				console.log("[Processing] Dismissing WebBrowser...");
				try {
					await WebBrowser.dismissBrowser();
				} catch (e) {
					console.warn("[Processing] Failed to dismiss browser:", e);
				}

				// Small delay to ensure browser closes before navigation
				await new Promise((resolve) => setTimeout(resolve, 300));

				// Then handle the redirect to result screen
				if (isMountedRef.current) {
					console.log("[Processing] Handling payment redirect:", url);
					handlePaymentRedirect(url);
				}
			} catch (error) {
				console.error("[Processing] Error handling URL:", error);
			}
		};

		// Subscribe to deep link events
		const subscription = Linking.addEventListener("url", handleUrl);

		// Also check for initial URL (in case app was closed and opened via deep link)
		const checkInitialUrl = async () => {
			const initialUrl = await Linking.getInitialURL();
			if (initialUrl != null && isMountedRef.current) {
				console.log("[Processing] Initial URL on mount:", initialUrl);
				handleUrl({ url: initialUrl });
			}
		};

		checkInitialUrl();

		return () => {
			subscription.remove();
		};
	}, []);

	// Polling để kiểm tra trạng thái thanh toán
	const startPolling = useCallback(async () => {
		if (isPollingRef.current || !isMountedRef.current) return;

		isPollingRef.current = true;
		setIsPolling(true);

		try {
			const result = await pollPaymentStatus(txnRef, 60, 2000);

			if (!isMountedRef.current) return;

			setPaymentData(result);

			if (result.status === "SUCCESS") {
				setStatus("success");
				const timer = setTimeout(() => {
					if (!isMountedRef.current) return;
					router.push({
						pathname: "/payment/result",
						params: {
							status: "success",
							txnRef: result.txnRef,
							amount: result.amount,
							paymentMethod: result.paymentMethod,
						},
					});
				}, 2000);
				timersRef.current.push(timer);
			} else if (result.status === "FAILED") {
				setStatus("failed");
			} else {
				setStatus("expired");
			}
		} catch (error) {
			if (!isMountedRef.current) return;
			console.error("[Payment] Polling error:", error);
			setStatus("failed");
		} finally {
			if (isMountedRef.current) {
				isPollingRef.current = false;
				setIsPolling(false);
			}
		}
	}, [txnRef, router]);

	// Auto open payment URL with WebBrowser to capture redirect
	useEffect(() => {
		if (!isMountedRef.current || !paymentUrl || !txnRef) return;

		const openPaymentUrl = async () => {
			if (!isMountedRef.current) return;

			console.log("🔗 [Processing] Opening payment URL with WebBrowser:", {
				paymentUrl,
				paymentMethod,
				txnRef,
			});

			try {
				// Open payment URL in in-app browser
				// WebBrowser automatically closes when user navigates back or completes
				const result = await WebBrowser.openBrowserAsync(paymentUrl);

				if (!isMountedRef.current) return;

				console.log("[Processing] WebBrowser result:", result);

				// If user dismissed the browser OR completed payment, start polling to check status
				// VNPay/MoMo redirect to our server, which should update payment status
				if (result.type === "dismiss" || result.type === "cancel") {
					console.log(
						"[Processing] Browser closed/dismissed, starting polling to check status",
					);
					setStatus("waiting");
					startPolling();
				} else {
					console.log(
						"[Processing] Browser session completed, checking payment status",
					);
					// Small delay to let webhook process
					const timer = setTimeout(() => {
						if (isMountedRef.current) {
							setStatus("waiting");
							startPolling();
						}
					}, 1000);
					timersRef.current.push(timer);
				}
			} catch (err) {
				if (!isMountedRef.current) return;

				console.error("❌ Failed to open payment URL:", {
					error: err,
					paymentUrl,
					errorMessage: err instanceof Error ? err.message : String(err),
				});

				Alert.alert("Lỗi", "Không thể mở trang thanh toán. Vui lòng thử lại.");
				setStatus("failed");
			}
		};

		// Delay to ensure screen is ready
		const timer = setTimeout(() => {
			openPaymentUrl();
		}, 1000);

		timersRef.current.push(timer);
		return () => clearTimeout(timer);
	}, [paymentUrl, txnRef, startPolling]);

	// Countdown timer
	useEffect(() => {
		if (status !== "waiting" || timeRemaining <= 0 || !isMountedRef.current)
			return;

		const interval = setInterval(() => {
			if (!isMountedRef.current) return;

			setTimeRemaining((prev) => {
				if (prev <= 1) {
					setStatus("expired");
					return 0;
				}
				return prev - 1;
			});
		}, 1000);

		intervalsRef.current.push(interval);
		return () => clearInterval(interval);
	}, [status, timeRemaining]);

	const getPaymentIcon = () => {
		if (paymentMethod === "momo") {
			return <MomoIcon width={40} height={40} />;
		}
		return <VNPayIcon width={40} height={40} />;
	};

	const getPaymentMethodName = () => {
		return paymentMethod === "momo" ? "Momo" : "VNPay";
	};

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const handleRetry = () => {
		isPollingRef.current = false;
		setStatus("initializing");
		setTimeRemaining(300);
		setPaymentData(null);

		const retryPayment = async () => {
			try {
				const result = await WebBrowser.openBrowserAsync(paymentUrl);
				if (!isMountedRef.current) return;

				console.log("[Processing] Retry WebBrowser result:", result);

				// Start polling after browser closes
				if (result.type === "dismiss" || result.type === "cancel") {
					console.log("[Processing] Browser closed on retry, starting polling");
					setStatus("waiting");
					startPolling();
				}
			} catch (err) {
				if (!isMountedRef.current) return;
				console.error("❌ Retry failed:", err);
				Alert.alert("Lỗi", "Không thể mở trang thanh toán");
				setStatus("failed");
			}
		};

		retryPayment();
	};

	const handleBackToHome = () => {
		router.replace("/(tabs)/payment");
	};

	return (
		<SafeAreaView className="flex-1 bg-[#F3F4F6]">
			<CustomHeader
				title="Xử lý thanh toán"
				showBackButton={false}
				backgroundColor="#F3F4F6"
			/>

			<ScrollView
				className="flex-1 px-4"
				showsVerticalScrollIndicator={false}
				contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
			>
				{/* Status Display */}
				{status === "initializing" && (
					<View className="items-center py-12">
						<View className="bg-white rounded-full p-6 mb-4 shadow-sm">
							<ActivityIndicator color="#E09B6B" size="large" />
						</View>
						<Text className="text-lg font-bold text-gray-800 mb-2">
							Chuẩn bị thanh toán
						</Text>
						<Text className="text-sm text-gray-500 text-center">
							Đang chuyển bạn đến {getPaymentMethodName()}...
						</Text>
					</View>
				)}

				{status === "waiting" && (
					<View className="items-center py-12">
						<View className="bg-white rounded-full p-6 mb-4 shadow-sm">
							<ActivityIndicator color="#E09B6B" size="large" />
						</View>
						<Text className="text-lg font-bold text-gray-800 mb-2">
							Đang đợi xác nhận thanh toán
						</Text>
						<Text className="text-sm text-gray-500 text-center mb-6">
							Vui lòng hoàn thành giao dịch trên {getPaymentMethodName()}
						</Text>

						{/* Time Remaining */}
						<View className="bg-blue-50 rounded-lg p-4 mb-4 w-full">
							<Text className="text-xs font-semibold text-blue-900 mb-2">
								Thời gian còn lại
							</Text>
							<Text className="text-2xl font-bold text-blue-600">
								{formatTime(timeRemaining)}
							</Text>
						</View>

						{/* Info Card */}
						<View className="bg-gray-50 rounded-lg p-4 w-full">
							<View className="flex-row items-center mb-3">
								<View className="w-12 h-12 rounded-lg bg-white items-center justify-center mr-3">
									{getPaymentIcon()}
								</View>
								<View className="flex-1">
									<Text className="font-bold text-gray-800">
										{getPaymentMethodName()}
									</Text>
									<Text className="text-sm text-gray-500">
										Mã giao dịch: {txnRef}
									</Text>
								</View>
							</View>

							<View className="border-t border-gray-200 pt-3">
								<View className="flex-row justify-between mb-2">
									<Text className="text-sm text-gray-600">Số tiền:</Text>
									<Text className="font-bold text-gray-800">
										{amount.toLocaleString("vi-VN")} đ
									</Text>
								</View>
							</View>
						</View>
					</View>
				)}

				{status === "success" && (
					<View className="items-center py-12">
						<View className="bg-green-100 rounded-full p-6 mb-4">
							<CheckCircle size={60} color="#10B981" />
						</View>
						<Text className="text-lg font-bold text-gray-800 mb-2">
							Thanh toán thành công!
						</Text>
						<Text className="text-sm text-gray-500 text-center mb-4">
							Giao dịch của bạn đã được xác nhận
						</Text>

						{paymentData && (
							<View className="bg-white rounded-lg p-4 w-full mb-4 shadow-sm">
								<View className="flex-row justify-between mb-2">
									<Text className="text-sm text-gray-600">Mã giao dịch:</Text>
									<Text className="font-mono text-sm text-gray-800">
										{paymentData.txnRef}
									</Text>
								</View>
								<View className="flex-row justify-between mb-2">
									<Text className="text-sm text-gray-600">Số tiền:</Text>
									<Text className="font-bold text-gray-800">
										{Number(paymentData.amount).toLocaleString("vi-VN")} đ
									</Text>
								</View>
								<View className="flex-row justify-between mb-2">
									<Text className="text-sm text-gray-600">Phương thức:</Text>
									<Text className="font-semibold text-gray-800">
										{paymentData.paymentMethod}
									</Text>
								</View>
								<View className="flex-row justify-between">
									<Text className="text-sm text-gray-600">
										Ngày thanh toán:
									</Text>
									<Text className="text-sm text-gray-800">
										{paymentData.payDate
											? new Date(paymentData.payDate).toLocaleString("vi-VN")
											: "N/A"}
									</Text>
								</View>
							</View>
						)}
					</View>
				)}

				{status === "failed" && (
					<View className="items-center py-12">
						<View className="bg-red-100 rounded-full p-6 mb-4">
							<XCircle size={60} color="#EF4444" />
						</View>
						<Text className="text-lg font-bold text-gray-800 mb-2">
							Thanh toán thất bại
						</Text>
						<Text className="text-sm text-gray-500 text-center mb-4">
							Giao dịch không thể hoàn thành. Vui lòng thử lại.
						</Text>

						{paymentData && (
							<View className="bg-red-50 rounded-lg p-3 w-full mb-4">
								<Text className="text-xs text-red-700 mb-2">
									Mã giao dịch: {paymentData.txnRef}
								</Text>
							</View>
						)}
					</View>
				)}

				{status === "expired" && (
					<View className="items-center py-12">
						<View className="bg-yellow-100 rounded-full p-6 mb-4">
							<AlertCircle size={60} color="#F59E0B" />
						</View>
						<Text className="text-lg font-bold text-gray-800 mb-2">
							Giao dịch hết hạn
						</Text>
						<Text className="text-sm text-gray-500 text-center mb-4">
							Thời gian thanh toán đã vượt quá giới hạn. Vui lòng tạo giao dịch
							mới.
						</Text>
					</View>
				)}

				{/* Action Buttons */}
				<View className="flex-row gap-3 mt-8">
					{(status === "failed" || status === "expired") && (
						<>
							{status === "failed" && (
								<TouchableOpacity
									onPress={handleRetry}
									disabled={isPolling}
									className="flex-1 bg-main rounded-lg p-3 items-center justify-center"
									style={{ opacity: isPolling ? 0.6 : 1 }}
								>
									<Text className="text-white font-bold text-base">
										{isPolling ? "Đang xử lý..." : "Thử lại"}
									</Text>
								</TouchableOpacity>
							)}
							<TouchableOpacity
								onPress={handleBackToHome}
								className="flex-1 border-2 border-main rounded-lg p-3 items-center justify-center"
							>
								<Text className="text-main font-bold text-base">Quay lại</Text>
							</TouchableOpacity>
						</>
					)}

					{status === "success" && (
						<TouchableOpacity
							onPress={handleBackToHome}
							className="w-full bg-main rounded-lg p-3 items-center justify-center"
						>
							<Text className="text-white font-bold text-base">Quay lại</Text>
						</TouchableOpacity>
					)}
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
