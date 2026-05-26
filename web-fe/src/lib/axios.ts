import axios from "axios";
import {
	clearAuthStorage,
	getAccessToken,
	setTokens,
} from "@/lib/auth-storage";
import { refreshToken } from "@/services/auth.service";

const axiosInstance = axios.create({
	baseURL: import.meta.env.VITE_API_URL || "http://localhost:8080/api",
	timeout: 50000,
	headers: {
		"Content-Type": "application/json",
	},
	withCredentials: true,
});
export const refreshAxios = axios.create({
	baseURL: import.meta.env.VITE_API_URL || "http://localhost:8080/api",
	withCredentials: true,
});

axiosInstance.interceptors.request.use((config) => {
	const token = getAccessToken();

	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}

	return config;
});

axiosInstance.interceptors.response.use(
	(response) => response,

	async (error) => {
		const originalRequest = error.config;
		if (!originalRequest) return Promise.reject(error);

		// nếu token hết hạn
		if (error.response?.status === 401 && !originalRequest._retry) {
			originalRequest._retry = true;

			// Single-flight refresh implementation
			let isRefreshing = (axiosInstance as any)._isRefreshing as boolean;
			let subscribers = (axiosInstance as any)._refreshSubscribers as Array<
				(token: string | null) => void
			>;

			if (!subscribers) {
				subscribers = [];
				(axiosInstance as any)._refreshSubscribers = subscribers;
			}

			const subscribeTokenRefresh = (cb: (token: string | null) => void) => {
				subscribers.push(cb);
			};

			const onRefreshed = (token: string | null) => {
				subscribers.forEach((cb) => cb(token));
				(axiosInstance as any)._refreshSubscribers = [];
			};

			if (!(axiosInstance as any)._isRefreshing) {
				(axiosInstance as any)._isRefreshing = true;
				try {
					const res = await refreshToken();
					const { accessToken } = res;
					setTokens(accessToken);
					onRefreshed(accessToken);
				} catch (err) {
					// refresh failed -> clear and notify subscribers
					clearAuthStorage();
					onRefreshed(null);
					// redirect once if not already on login
					if (
						typeof window !== "undefined" &&
						window.location.pathname !== "/login"
					) {
						window.location.href = "/login";
					}
					(axiosInstance as any)._isRefreshing = false;
					return Promise.reject(err);
				} finally {
					(axiosInstance as any)._isRefreshing = false;
				}
			}

			// return a promise that resolves once the token is refreshed
			return new Promise((resolve, reject) => {
				subscribeTokenRefresh((token) => {
					if (token) {
						originalRequest.headers.Authorization = `Bearer ${token}`;
						resolve(axiosInstance(originalRequest));
					} else {
						reject(error);
					}
				});
			});
		}

		return Promise.reject(error);
	},
);

export default axiosInstance;
