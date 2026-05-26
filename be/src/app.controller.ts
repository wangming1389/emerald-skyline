import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";

@Controller()
export class AppController {
	constructor(private readonly appService: AppService) {}

	@Get()
	getHello(): string {
		return this.appService.getHello();
	}

	@Get("deploy-info")
	getDeployInfo() {
		return {
			status: "ok",
			marker: "vnpay-txnref-alnum-20260527",
			txnRefFormat: "alphanumeric",
			backendUrl: process.env.BACKEND_URL ?? null,
			mobileRedirectUrl: process.env.MOBILE_APP_REDIRECT_URL ?? null,
			renderServiceName: process.env.RENDER_SERVICE_NAME ?? null,
			renderExternalUrl: process.env.RENDER_EXTERNAL_URL ?? null,
			renderGitCommit: process.env.RENDER_GIT_COMMIT ?? null,
		};
	}
}
