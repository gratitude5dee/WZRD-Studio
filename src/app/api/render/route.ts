import type { NextRequest } from "next/server";

import { requireApiUser } from "../_lib/auth";
import { apiJson } from "../_lib/responses";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: NextRequest) {
	const auth = await requireApiUser(request);
	if ("response" in auth) return auth.response;

	return apiJson(
		{
			error: "render_offload_unconfigured",
			message:
				"Browser render offload requires the web_render_jobs persistence phase before jobs can be queued.",
		},
		{ status: 501 }
	);
}
