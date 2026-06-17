"use client";

import { useEffect, useState } from "react";
import { platform, PlatformCapability } from "@qcut/platform-core";
import { useSkillsStore } from "@qcut-app/stores/skills-store";
import { useProjectStore } from "@qcut-app/stores/project-store";
import { SkillCard } from "../skill-card";
import { ImportSkillDialog } from "../import-skill-dialog";
import { Button } from "@qcut-app/components/ui/button";
import { Plus, Loader2, Brain } from "lucide-react";
import { ScrollArea } from "@qcut-app/components/ui/scroll-area";

export function SkillsView() {
	const { skills, isLoading, loadSkills, deleteSkill } = useSkillsStore();
	const { activeProject } = useProjectStore();
	const [isImportOpen, setIsImportOpen] = useState(false);
		const [showDebug, setShowDebug] = useState(false);
		const [agentLog, setAgentLog] = useState<any[]>([]);
		const [rateLimitState, setRateLimitState] = useState<null | {
			windowMs: number;
			maxCalls: number;
			currentCalls: number;
		}>(null);


	const skillsSupported = (() => {
		try {
			return platform().hasCapability(PlatformCapability.Skills);
		} catch {
			return false;
		}
	})();

	useEffect(() => {
		if (!skillsSupported) return;
		if (activeProject?.id) {
			loadSkills(activeProject.id);
		}
	}, [activeProject?.id, loadSkills, skillsSupported]);

	useEffect(() => {
		if (!showDebug) return;
		let cancelled = false;
		const read = () => {
			try {
				const debug = (window as any).wzrd?.editor?.debug;
				if (!debug) return;
				const log = debug.getCommandLog?.() ?? [];
				const rate = debug.getRateLimitState?.() ?? null;
				if (!cancelled) {
					setAgentLog(log);
					setRateLimitState(rate);
				}
			} catch {
				// ignore
			}
		};
		read();
		const interval = window.setInterval(read, 750);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [showDebug]);



	if (!skillsSupported) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
				<Brain className="h-12 w-12 mb-2 opacity-50" />
				<p className="text-sm">Skills require the desktop app</p>
				<p className="text-xs mt-1">Open WZRD Studio Desktop to manage project skills.</p>
			</div>
		);
	}
	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col">
			{/* Header */}
			<div className="p-3 border-b border-border flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Brain className="h-4 w-4 text-primary" />
					<span className="font-medium text-sm">Skills</span>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setIsImportOpen(true)}
				>
					<Plus className="h-4 w-4 mr-1" />
					Import
				</Button>
			</div>

			{/* Skills List */}
			<ScrollArea className="flex-1">
				<div className="p-3 space-y-2">
					{skills.length === 0 ? (
						<div className="text-center py-8 text-muted-foreground">
							<Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
							<p className="text-sm">No skills in this project</p>
							<p className="text-xs mt-1">
								Import skills from .claude/skills folder
							</p>
						</div>
					) : (
						skills.map((skill) => (
							<SkillCard
								key={skill.id}
								skill={skill}
								onDelete={() => {
									if (activeProject) {
										deleteSkill(activeProject.id, skill.id);
									}
								}}
							/>
						))
					)}

						<div className="pt-3 mt-3 border-t border-border">
							<div className="flex items-center justify-between">
								<span className="text-xs font-medium text-muted-foreground">Agent command log</span>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => setShowDebug((v) => !v)}
									>
										{showDebug ? "Hide" : "Show"}
									</Button>
									{showDebug ? (
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => {
												try {
													(window as any).wzrd?.editor?.debug?.clearCommandLog?.();
													setAgentLog([]);
												} catch {
													// ignore
												}
										}}
										>
											Clear
										</Button>
									) : null}
								</div>
							</div>

							{showDebug ? (
								<div className="mt-2 space-y-2">
									{rateLimitState ? (
										<div className="text-[11px] text-muted-foreground">
											Rate limit: {rateLimitState.currentCalls}/{rateLimitState.maxCalls} per {rateLimitState.windowMs}ms
										</div>
									) : null}
									<div className="rounded border border-border bg-background/40 p-2">
										{agentLog.length === 0 ? (
											<div className="text-[11px] text-muted-foreground">No agent commands executed yet.</div>
										) : (
											<ul className="space-y-1 max-h-48 overflow-auto">
												{agentLog
													.slice(-50)
													.reverse()
													.map((entry: any) => (
														<li key={entry.id} className="text-[11px]">
															<span className={entry.ok ? "text-green-500" : "text-red-500"}>
																{entry.ok ? "OK" : "ERR"}
															</span>
															<span className="ml-2 text-muted-foreground">
																{new Date(entry.ts).toLocaleTimeString()} • {entry.source}
															</span>
															<span className="ml-2 font-mono">{entry.command}</span>
															{entry.error ? (
																<span className="ml-2 text-muted-foreground">— {entry.error}</span>
															) : null}
														</li>
												))}
											</ul>
										)}
									</div>
								</div>
							) : null}
						</div>
				</div>
			</ScrollArea>

			<ImportSkillDialog open={isImportOpen} onOpenChange={setIsImportOpen} />
		</div>
	);
}
