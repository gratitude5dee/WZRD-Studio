import React from "react";
import { render, type RenderOptions } from "@testing-library/react";

import { TooltipProvider } from "@qcut-app/components/ui/tooltip";

/**
 * Minimal test utils for vendored QCut tests.
 *
 * WZRD-EDIT: QCut upstream wraps tests with next-themes. WZRD doesn't use
 * next-themes; for our quarantine tests we only need the TooltipProvider.
 */
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
	return <TooltipProvider>{children}</TooltipProvider>;
};

const customRender = (
	ui: React.ReactElement,
	options?: Omit<RenderOptions, "wrapper">
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from "@testing-library/react";
export { customRender as render };
