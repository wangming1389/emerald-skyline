jest.mock(
	"src/interceptors/transform.interceptor",
	() => ({
		TransformInterceptor: class TransformInterceptor {},
	}),
	{ virtual: true },
);

import { HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { Request, Response } from "express";
import { AccountsService } from "../accounts/accounts.service";
import { Account } from "../accounts/entities/account.entity";
import { UserRole } from "../accounts/enums/user-role.enum";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { LocalStrategy } from "./strategies/local.strategy";
import { RefreshTokenStrategy } from "./strategies/refresh-token.strategy";

describe("AuthModule (Unit + Integration)", () => {
	let authService: AuthService;
	let authController: AuthController;
	let accountsService: jest.Mocked<AccountsService>;
	let jwtService: jest.Mocked<JwtService>;
	let configService: jest.Mocked<ConfigService>;

	const createMockAccount = (
		overrides: Partial<Account> = {},
		isPasswordValid: boolean = true,
	): Account => {
		const account = new Account();
		account.id = overrides.id ?? 1;
		account.email = overrides.email ?? "test123@example.com";
		account.password = overrides.password ?? "hashedPassword";
		account.role = overrides.role ?? UserRole.RESIDENT;
		account.isActive = overrides.isActive ?? true;
		account.createdAt = overrides.createdAt ?? new Date();
		account.updatedAt = overrides.updatedAt ?? new Date();
		account.hashPassword = jest.fn();
		account.validatePassword = jest.fn().mockReturnValue(isPasswordValid);
		return Object.assign(account, overrides);
	};

	const mockAccount = createMockAccount();
	const mockInactiveAccount = createMockAccount({ id: 2, isActive: false });
	const mockTokens = {
		accessToken: "mock.access.token",
		refreshToken: "mock.refresh.token",
	};
	const mockUserPayload = {
		id: 1,
		email: "test123@example.com",
		role: UserRole.RESIDENT,
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuthService,
				{
					provide: AccountsService,
					useValue: {
						findByEmail: jest.fn(),
						findOne: jest.fn(),
						update: jest.fn(),
					},
				},
				{
					provide: JwtService,
					useValue: {
						sign: jest.fn(),
					},
				},
				{
					provide: ConfigService,
					useValue: {
						get: jest.fn((key: string) => {
							if (key === "JWT_SECRET") return "secret";
							if (key === "JWT_REFRESH_SECRET") return "refreshSecret";
							if (key === "JWT_EXPIRATION") return "15m";
							if (key === "JWT_REFRESH_EXPIRATION") return "7d";
							return undefined;
						}),
					},
				},
				LocalStrategy,
				JwtStrategy,
				RefreshTokenStrategy,
			],
			controllers: [AuthController],
		}).compile();

		authService = module.get<AuthService>(AuthService);
		authController = module.get<AuthController>(AuthController);
		accountsService = module.get(AccountsService);
		jwtService = module.get(JwtService);
		configService = module.get(ConfigService);

		jest.spyOn(jwtService, "sign").mockImplementation((_, options) => {
			if (options?.secret === "refreshSecret") return mockTokens.refreshToken;
			return mockTokens.accessToken;
		});
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe("AuthService", () => {
		describe("validateUser", () => {
			it("should return user without password when credentials are valid", async () => {
				accountsService.findByEmail.mockResolvedValue(mockAccount);

				const result = await authService.validateUser(
					"test123@example.com",
					"password",
				);

				expect(result).toBeDefined();
				expect("password" in (result as Record<string, unknown>)).toBe(false);
				expect(result?.email).toBe(mockAccount.email);
			});

			it("should return null when user not found", async () => {
				accountsService.findByEmail.mockResolvedValue(null);

				const result = await authService.validateUser(
					"notfound@example.com",
					"password",
				);

				expect(result).toBeNull();
			});

			it("should throw Unauthorized when account is inactive", async () => {
				accountsService.findByEmail.mockResolvedValue(mockInactiveAccount);

				await expect(
					authService.validateUser("inactive@example.com", "password"),
				).rejects.toThrow(
					new HttpException("Account is inactive", HttpStatus.UNAUTHORIZED),
				);
			});

			it("should return null when password is invalid", async () => {
				accountsService.findByEmail.mockResolvedValue(
					createMockAccount({}, false),
				);

				const result = await authService.validateUser(
					"test123@example.com",
					"wrong",
				);

				expect(result).toBeNull();
			});
		});

		describe("generateTokens & login", () => {
			it("should generate both access and refresh tokens", () => {
				const tokens = authService.generateTokens(mockAccount);

				expect(tokens.accessToken).toBe(mockTokens.accessToken);
				expect(tokens.refreshToken).toBe(mockTokens.refreshToken);
				expect(jwtService.sign).toHaveBeenCalledTimes(2);
			});

			it("should return user profile + accessToken only in login", () => {
				const result = authService.login(mockAccount);

				expect(result.accessToken).toBeDefined();
				expect("password" in (result as Record<string, unknown>)).toBe(false);
				expect(result.email).toBe(mockAccount.email);
			});
		});

		describe("refreshTokens", () => {
			it("should return new tokens when user is active and email matches", async () => {
				accountsService.findOne.mockResolvedValue(mockAccount);

				const result = await authService.refreshTokens(
					1,
					"test123@example.com",
				);

				expect(result.accessToken).toBeDefined();
				expect(result.refreshToken).toBeDefined();
			});

			it("should throw when user not found or inactive", async () => {
				accountsService.findOne.mockRejectedValue(
					new HttpException(
						"Tài khoản với ID 999 không tồn tại",
						HttpStatus.NOT_FOUND,
					),
				);

				await expect(
					authService.refreshTokens(999, "test123@example.com"),
				).rejects.toThrow(HttpException);
			});

			it("should throw when email in token does not match", async () => {
				accountsService.findOne.mockResolvedValue(mockAccount);

				await expect(
					authService.refreshTokens(1, "wrong@email.com"),
				).rejects.toThrow(
					new HttpException("Invalid token", HttpStatus.UNAUTHORIZED),
				);
			});
		});

		describe("changePassword", () => {
			it("should change password successfully", async () => {
				accountsService.findOne.mockResolvedValue(mockAccount);
				accountsService.update.mockResolvedValue(mockAccount);

				const result = await authService.changePassword(
					1,
					"oldPass",
					"newPass123!",
				);

				expect(result.message).toContain("successfully");
				expect(accountsService.update).toHaveBeenCalledWith(1, {
					password: "newPass123!",
				});
			});

			it("should throw when old password is incorrect", async () => {
				accountsService.findOne.mockResolvedValue(createMockAccount({}, false));

				await expect(
					authService.changePassword(1, "wrong", "new"),
				).rejects.toThrow(
					new HttpException(
						"Old password is incorrect",
						HttpStatus.BAD_REQUEST,
					),
				);
			});

			it("should throw when new password same as old", async () => {
				const samePasswordAccount = createMockAccount();
				samePasswordAccount.validatePassword = jest
					.fn()
					.mockImplementation((password: string) => password === "same");
				accountsService.findOne.mockResolvedValue(samePasswordAccount);

				await expect(
					authService.changePassword(1, "same", "same"),
				).rejects.toThrow(
					new HttpException(
						"Password cannot be the same as the old password",
						HttpStatus.BAD_REQUEST,
					),
				);
			});
		});

		describe("getProfile", () => {
			it("should return user without password", async () => {
				accountsService.findOne.mockResolvedValue(mockAccount);

				const result = await authService.getProfile(1);

				expect("password" in (result as Record<string, unknown>)).toBe(false);
				expect(result.email).toBe(mockAccount.email);
			});
		});
	});

	describe("AuthController", () => {
		let mockRequest: Partial<Request> & {
			user?: Account | { id: number; email: string };
		};
		let mockResponse: Partial<Response>;

		beforeEach(() => {
			mockResponse = {
				cookie: jest.fn(),
				clearCookie: jest.fn(),
			};
			mockRequest = { user: mockAccount };
		});

		describe("login", () => {
			it("should login successfully, set refreshToken cookie, return user + accessToken", () => {
				const loginDto: LoginDto = {
					email: "test123@example.com",
					password: "password",
				};

				const result = authController.login(
					loginDto,
					mockRequest as Request & { user: Account },
					mockResponse as Response,
				);

				expect(result.accessToken).toBeDefined();
				expect(result.email).toBe(mockAccount.email);
				expect(mockResponse.cookie).toHaveBeenCalledWith(
					"refreshToken",
					expect.any(String),
					expect.objectContaining({ httpOnly: true, sameSite: "strict" }),
				);
			});
		});

		describe("refreshTokens", () => {
			it("should refresh tokens and update cookie", async () => {
				mockRequest.user = { id: 1, email: "test123@example.com" };
				jest.spyOn(authService, "refreshTokens").mockResolvedValue(mockTokens);

				const result = await authController.refreshTokens(
					mockRequest as Request & { user: { id: number; email: string } },
					mockResponse as Response,
				);

				expect(result.accessToken).toBe(mockTokens.accessToken);
				expect(mockResponse.cookie).toHaveBeenCalledWith(
					"refreshToken",
					mockTokens.refreshToken,
					expect.any(Object),
				);
			});
		});

		describe("logout", () => {
			it("should clear refreshToken cookie", () => {
				const result = authController.logout(mockResponse as Response);

				expect(result.message).toContain("successful");
				expect(mockResponse.clearCookie).toHaveBeenCalledWith(
					"refreshToken",
					expect.any(Object),
				);
			});
		});

		describe("getProfile & changePassword", () => {
			it("should get profile", async () => {
				jest
					.spyOn(authService, "getProfile")
					.mockResolvedValue({ id: 1, email: "test123@example.com" } as Omit<
						Account,
						"password"
					>);

				const result = await authController.getProfile({
					user: { id: 1 },
				} as Request & {
					user: { id: number };
				});

				expect(result.email).toBe("test123@example.com");
			});

			it("should change password", async () => {
				const dto: ChangePasswordDto = {
					oldPassword: "old",
					newPassword: "NewPass123!",
				};
				jest
					.spyOn(authService, "changePassword")
					.mockResolvedValue({ message: "success" });

				const result = await authController.changePassword(
					{ user: { id: 1 } } as Request & { user: { id: number } },
					dto,
				);

				expect(result.message).toBe("success");
			});
		});
	});

	describe("Strategies & Guards", () => {
		it("LocalStrategy should call authService.validateUser", async () => {
			const localStrategy = new LocalStrategy(authService);
			jest
				.spyOn(authService, "validateUser")
				.mockResolvedValue(mockUserPayload);

			const result = await localStrategy.validate(
				"test123@example.com",
				"password",
			);

			expect(result).toEqual(mockUserPayload);
		});

		it("JwtStrategy should validate active user", async () => {
			const jwtStrategy = new JwtStrategy(
				configService,
				accountsService as AccountsService,
			);
			accountsService.findOne.mockResolvedValue(mockAccount);

			const result = await jwtStrategy.validate({
				sub: 1,
				email: "test123@example.com",
				role: UserRole.RESIDENT,
			});

			expect(result.id).toBe(1);
		});

		it("RefreshTokenStrategy should validate from cookie", async () => {
			const refreshStrategy = new RefreshTokenStrategy(
				configService,
				accountsService as AccountsService,
			);
			accountsService.findOne.mockResolvedValue(mockAccount);

			const result = await refreshStrategy.validate({
				sub: 1,
				email: "test123@example.com",
			});

			expect(result.id).toBe(1);
		});
	});

	describe("Integration flows", () => {
		it("login -> refresh -> logout full cycle", async () => {
			const loginReq = { user: mockAccount } as Request & { user: Account };
			const loginRes = { cookie: jest.fn() } as unknown as Response;

			const loginResult = authController.login(
				{} as LoginDto,
				loginReq,
				loginRes,
			);
			expect(loginResult.accessToken).toBeDefined();

			accountsService.findOne.mockResolvedValue(mockAccount);
			const refreshReq = {
				user: { id: 1, email: "test123@example.com" },
			} as Request & { user: { id: number; email: string } };
			const refreshRes = { cookie: jest.fn() } as unknown as Response;

			const refreshResult = await authController.refreshTokens(
				refreshReq,
				refreshRes,
			);
			expect(refreshResult.accessToken).toBeDefined();

			const logoutRes = { clearCookie: jest.fn() } as unknown as Response;
			const logoutResult = authController.logout(logoutRes);
			expect(logoutResult.message).toContain("successful");
		});

		it("should throw on inactive account during refresh", async () => {
			accountsService.findOne.mockResolvedValue(mockInactiveAccount);

			await expect(
				authService.refreshTokens(2, "test123@example.com"),
			).rejects.toThrow(HttpException);
		});

		it("change password -> getProfile flow", async () => {
			accountsService.findOne.mockResolvedValue(mockAccount);
			accountsService.update.mockResolvedValue(mockAccount);

			await authService.changePassword(1, "old123", "NewPass123!");

			accountsService.findOne.mockResolvedValue(mockAccount);
			const profile = await authService.getProfile(1);

			expect(profile.email).toBe(mockAccount.email);
		});
	});
});
