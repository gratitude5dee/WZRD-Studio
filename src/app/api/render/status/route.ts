import type { NextRequest } from "next/server";

import { requireApiUser } from "../../_lib/auth";
import { apiJson } from "../../_lib/responses";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: NextRequest) {
	const auth = await requireApiUser(request);
	if ("response" in auth) return auth.response;

	const jobId = request.nextUrl.searchParams.get("jobId");
	if (!jobId) {
		return apiJson(
			{ error: "missing_job_id", message: "Missing jobId parameter." },
			{ status: 400 }
		);
	}

	return apiJson(
		{
			error: "render_job_not_found",
			jobId,
			message:
				"Render job status is not available until web_render_jobs persistence is enabled.",
		},
		{ status: 404 }
	);
}
