"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { platform } from "@qcut/platform-core";

import { Button } from "@qcut-app/components/ui/button";
import { useProjectStore } from "@qcut-app/stores/project-store";
import { Loader2, MessageSquareWarning, Send } from "lucide-react";

type PiAgent = any;

type PiModules = {
	Agent: new (args: any) => PiAgent;
	getModel: (provider: string, model: string) => any;
	registerBuiltInApiProviders: () => void;
};

let providersRegistered = false;
async function loadPiModules(): Promise<PiModules> {
	// Some downstream deps expect a Node-like `process.env`.
	const g = globalThis as any;
	if (!g.process) g.process = { env: { NODE_ENV: "production" } };
	if (!g.process.env) g.process.env = { NODE_ENV: "production" };
	if (!g.process.nextTick) {
		g.process.nextTick = (fn: (...args: any[]) => void, ...args: any[]) =>
			Promise.resolve().then(() => fn(...args));
	}

	const [{ Agent }, piAi] = await Promise.all([
		import("@mariozechner/pi-agent-core"),
		import("@mariozechner/pi-ai"),
	]);

	const registerBuiltInApiProviders = (piAi as any).registerBuiltInApiProviders;
	const getModel = (piAi as any).getModel;

	if (typeof registerBuiltInApiProviders !== "function" || typeof getModel !== "function") {
		throw new Error("pi-ai registry failed to load");
	}

	if (!providersRegistered) {
		registerBuiltInApiProviders();
		providersRegistered = true;
	}

	return { Agent: Agent as any, getModel, registerBuiltInApiProviders };
}

function contentToText(content: any): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((block) => block && typeof block === "object")
		.map((block) => {
			if (block.type === "text") return String(block.text ?? "");
			if (block.type === "toolCall") return `[tool] ${String(block.name ?? "")}`;
			if (block.type === "toolResult") return `[tool-result] ${String(block.name ?? "")}`;
			return "";
		})
		.join("");
}

export function PiAgentChatView() {
	const { activeProject } = useProjectStore();
	const projectLabel = activeProject?.name || activeProject?.id || "Untitled";

	const [draft, setDraft] = useState("");
	const [tick, setTick] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [hasKey, setHasKey] = useState<boolean | null>(null);
	const [initError, setInitError] = useState<string | null>(null);

	const scrollRef = useRef<HTMLDivElement | null>(null);
	const agentRef = useRef<PiAgent | null>(null);

	// Create a new agent when the active project label changes.
	useEffect(() => {
		let disposed = false;
		setInitError(null);
		setError(null);
		setTick((t) => t + 1);

		(async () => {
			try {
				const { Agent, getModel } = await loadPiModules();

				const model =
					getModel("openrouter", "anthropic/claude-3.7-sonnet") ||
					getModel("openrouter", "anthropic/claude-3.5-haiku") ||
					getModel("openrouter", "anthropic/claude-3-haiku");

				if (!model) {
					throw new Error("No OpenRouter model found in pi-ai registry");
				}

				const agent = new Agent({
					initialState: {
						systemPrompt: `You are a helpful assistant embedded inside WZRD Studio's editor.\n\nProject: ${projectLabel}`,
						model,
						thinkingLevel: "off",
						messages: [],
						tools: [],
					},
					getApiKey: async (providerName: string) => {
						try {
							const keys = await platform().apiKeys.get();
							if (!keys) return undefined;
							if (providerName === "openrouter") return keys.openRouterApiKey;
							if (providerName === "anthropic") return keys.anthropicApiKey;
							if (providerName === "google") return keys.geminiApiKey;
							return undefined;
						} catch {
							return undefined;
						}
					},
				});

				if (disposed) {
					try {
						agent.abort?.();
					} catch {
						// ignore
					}
					return;
				}

				agentRef.current = agent;
				setTick((t) => t + 1);

				// Check key presence (OpenRouter)
				try {
					const keys = await platform().apiKeys.get();
					if (!disposed) setHasKey(Boolean(keys?.openRouterApiKey));
				} catch {
					if (!disposed) setHasKey(false);
				}

				// Subscribe to updates
				const unsubscribe = agent.subscribe?.((event: any) => {
					if (disposed) return;
					if (
						event.type === "message_update" ||
						event.type === "message_end" ||
						event.type === "turn_end" ||
						event.type === "agent_end" ||
						event.type === "error"
					) {
						setTick((t) => t + 1);
						if (event.type === "error") {
							setError(
								event.error?.errorMessage ||
									"Agent error. Check API key settings."
							);
						}
					}
				});

				return () => {
					try {
						unsubscribe?.();
					} catch {
						// ignore
					}
				};
			} catch (e) {
				if (disposed) return;
				setInitError(e instanceof Error ? e.message : String(e));
			}
		})();

		return () => {
			disposed = true;
			try {
				agentRef.current?.abort?.();
			} catch {
				// ignore
			}
			agentRef.current = null;
		};
	}, [projectLabel]);

	const agent = agentRef.current;

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [tick]);

	const messages = useMemo(() => agent?.state?.messages ?? [], [agent, tick]);
	const isStreaming = Boolean(agent?.state?.isStreaming);
	const streamingMessage = agent?.state?.streamingMessage ?? null;

	const send = async () => {
		const text = draft.trim();
		if (!text || !agent) return;
		setDraft("");
		setError(null);
		try {
			await agent.prompt(text);
			setTick((t) => t + 1);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	if (initError) {
		return (
			<div className="h-full flex flex-col items-center justify-center p-4 text-muted-foreground">
				<MessageSquareWarning className="h-10 w-10 mb-2 opacity-60" />
				<p className="text-sm">AI Chat failed to initialize</p>
				<p className="text-xs mt-2 max-w-[520px] text-center">{initError}</p>
			</div>
		);
	}

	if (!agent) {
		return (
			<div className="h-full flex flex-col items-center justify-center p-4 text-muted-foreground">
				<Loader2 className="h-10 w-10 mb-2 animate-spin opacity-60" />
				<p className="text-sm">Loading AI chat…</p>
			</div>
		);
	}

	return (
		<div className="h-full min-h-0 flex flex-col">
			{hasKey === false && (
				<div className="px-3 py-2 border-b bg-muted/30 text-xs text-muted-foreground">
					OpenRouter API key not set. Open <span className="font-medium">API Keys</span>
					 in the editor properties panel and set <span className="font-medium">openRouterApiKey</span>.
				</div>
			)}

			<div
				ref={scrollRef}
				className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3"
			>
				{messages.length === 0 && !streamingMessage && (
					<div className="text-center py-10 text-muted-foreground">
						<p className="text-sm">Ask anything about your project.</p>
						<p className="text-xs mt-1">This chat uses OpenRouter models.</p>
					</div>
				)}

				{messages.map((m: any, idx: number) => {
					const role = m?.role;
					if (role !== "user" && role !== "assistant" && role !== "toolResult") return null;
					const text = contentToText(m?.content);
					const isUser = role === "user";
					return (
						<div
							key={`${idx}-${role}`}
							className={
								isUser
									? "ml-auto max-w-[85%] rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap"
									: "mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
							}
						>
							{text || (role === "toolResult" ? "(tool result)" : "")}
						</div>
					);
				})}

				{streamingMessage && (
					<div className="mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
						{contentToText(streamingMessage?.content) || "…"}
					</div>
				)}

				{error && <div className="text-xs text-destructive whitespace-pre-wrap">{error}</div>}
			</div>

			<div className="border-t p-3 flex gap-2 items-end">
				<textarea
					className="flex-1 min-h-[44px] max-h-[160px] rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
					placeholder="Message…"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							send();
						}
					}}
					disabled={isStreaming}
				/>
				<Button type="button" onClick={send} disabled={isStreaming || !draft.trim()}>
					{isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
				</Button>
			</div>
		</div>
	);
}
