import React from "react";
import {
	Link as RRLink,
	useLocation,
	useNavigate as rrUseNavigate,
	useParams as rrUseParams,
	type LinkProps as RRLinkProps,
	type NavigateFunction,
} from "react-router-dom";

/**
 * Router shim for vendored QCut components.
 *
 * QCut upstream uses TanStack Router. In WZRD we keep react-router-dom.
 * This shim intentionally implements only the subset used by the vendored tree.
 */

type AnyRecord = Record<string, unknown>;

export type LinkProps = Omit<RRLinkProps, "to"> & {
	to: string;
	params?: AnyRecord;
	search?: AnyRecord;
	hash?: string;
};

function applyParamsToPath({
	path,
	params,
}: {
	path: string;
	params?: AnyRecord;
}): string {
	if (!params) return path;

	let out = path;
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === null) continue;
		// TanStack file-route params look like "$project_id" in the path.
		out = out.replaceAll(`$${k}`, encodeURIComponent(String(v)));
		// Some callers may pass ":param" style.
		out = out.replaceAll(`:${k}`, encodeURIComponent(String(v)));
	}
	return out;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function LinkShim(
	{ to, params, search, hash, ...rest },
	ref
) {
	const location = useLocation();
	const searchParams = new URLSearchParams(location.search);

	if (search && typeof search === "object") {
		for (const [k, v] of Object.entries(search)) {
			if (v === undefined || v === null) continue;
			searchParams.set(k, String(v));
		}
	}

	const resolvedPath = applyParamsToPath({ path: to, params });
	const nextTo = `${resolvedPath}${searchParams.toString() ? `?${searchParams.toString()}` : ""}${hash ?? ""}`;

	return <RRLink ref={ref} to={nextTo} {...rest} />;
});

export function useNavigate(): (
	opts: { to?: string; href?: string; replace?: boolean; params?: AnyRecord } | string
) => void {
	const navigate: NavigateFunction = rrUseNavigate();

	return (arg) => {
		if (typeof arg === "string") {
			navigate(arg);
			return;
		}
		const base = arg.href ?? arg.to;
		if (!base) return;
		const to = applyParamsToPath({ path: base, params: arg.params });
		navigate(to, { replace: arg.replace });
	};
}

export function useParams<
	TParams extends Record<string, string | undefined> = Record<
		string,
		string | undefined
	>,
>(
	_opts?: unknown
) {
	// TanStack Router's useParams can accept an options object.
	// We ignore routing "from" constraints, but we normalize common param names.
	const raw = rrUseParams() as any;
	const projectId = raw?.project_id ?? raw?.projectId;
	if (projectId && !raw.project_id) {
		raw.project_id = projectId;
	}
	return raw as TParams;
}

export function useSearch<TSearch extends Record<string, string> = Record<string, string>>() {
	const location = useLocation();
	const params = new URLSearchParams(location.search);
	const out: Record<string, string> = {};
	params.forEach((value, key) => {
		out[key] = value;
	});
	return out as TSearch;
}
