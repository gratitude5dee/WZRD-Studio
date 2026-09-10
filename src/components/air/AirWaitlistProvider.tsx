"use client";

import { createContext, type FormEvent, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import styles from "./AirWaitlistProvider.module.css";

const AIR_ORIGIN = process.env.NEXT_PUBLIC_AIR_WAITLIST_ORIGIN || "https://air.wzrd.tech";
const AIR_API = `${AIR_ORIGIN.replace(/\/$/, "")}/api`;
const SEEN_KEY = "wzrd-air-waitlist-seen";
type WaitlistResult = { receipt: string; position: number; totalWaiting: number; referralCode: string; referralCount: number };
type ContextValue = { openAirWaitlist: () => void };
const Context = createContext<ContextValue>({ openAirWaitlist: () => undefined });
export function useAirWaitlist() { return useContext(Context); }

export default function AirWaitlistProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"form" | "saving" | "joined">("form");
  const [error, setError] = useState("");
  const [result, setResult] = useState<WaitlistResult | null>(null);
  const openAirWaitlist = useCallback(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError(""); setStage("form"); setResult(null); setOpen(true);
    try { window.sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* storage can be unavailable */ }
  }, []);
  const restoreFocus = useCallback(() => {
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (target) window.setTimeout(() => target.focus({ preventScroll: true }), 0);
  }, []);
  const close = useCallback(() => { dialogRef.current?.close(); setOpen(false); restoreFocus(); }, [restoreFocus]);
  useEffect(() => { const dialog = dialogRef.current; if (dialog && open && !dialog.open) dialog.showModal(); }, [open]);
  useEffect(() => {
    const hero = document.getElementById("top"); if (!hero) return;
    let lastY = window.scrollY; let scrollIntent = false;
    const markIntent = () => { scrollIntent = true; };
    const onScroll = () => { const movingDown = window.scrollY > lastY + 3; lastY = window.scrollY; if (!movingDown || !scrollIntent || open || hero.getBoundingClientRect().bottom > 0) return; try { if (window.sessionStorage.getItem(SEEN_KEY)) return; } catch { /* continue */ } openAirWaitlist(); };
    const onKey = (event: KeyboardEvent) => { if (["ArrowDown", "PageDown", " "].includes(event.key)) markIntent(); };
    window.addEventListener("wheel", markIntent, { passive: true }); window.addEventListener("touchmove", markIntent, { passive: true }); window.addEventListener("keydown", onKey); window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("wheel", markIntent); window.removeEventListener("touchmove", markIntent); window.removeEventListener("keydown", onKey); window.removeEventListener("scroll", onScroll); };
  }, [open, openAirWaitlist]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStage("saving"); setError(""); const form = new FormData(event.currentTarget);
    const payload = { name: String(form.get("name") || ""), email: String(form.get("email") || ""), imessage: String(form.get("imessage") || ""), consent: form.get("consent") === "on", company: String(form.get("company") || ""), interest: "General", sourceSite: "wzrd" };
    try { const response = await fetch(`${AIR_API}/preorder`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json().catch(() => null) as Partial<WaitlistResult> & { ok?: boolean; stored?: boolean; message?: string } | null; if (!response.ok || body?.ok !== true || body.stored !== true || typeof body.receipt !== "string" || typeof body.position !== "number" || typeof body.totalWaiting !== "number" || typeof body.referralCode !== "string" || typeof body.referralCount !== "number") throw new Error(body?.message || "Air could not save your place yet. Please try again."); setResult({ receipt: body.receipt, position: body.position, totalWaiting: body.totalWaiting, referralCode: body.referralCode, referralCount: body.referralCount }); setStage("joined"); } catch (submitError) { setStage("form"); setError(submitError instanceof Error ? submitError.message : "Please try again."); }
  }
  return <Context.Provider value={{ openAirWaitlist }}>{children}<dialog ref={dialogRef} className={styles.dialog} aria-labelledby="wzrd-air-waitlist-title" onClose={() => { setOpen(false); restoreFocus(); }} onClick={(event) => { if (event.target === dialogRef.current) close(); }}><div className={styles.panel}><button className={styles.close} type="button" onClick={close} aria-label="Close Air waitlist">×</button>{stage !== "joined" ? <form onSubmit={submit} className={styles.form} aria-busy={stage === "saving"}><p className={styles.kicker}>Air / private beta</p><h2 id="wzrd-air-waitlist-title">Save your place in Air.</h2><p className={styles.lede}>Join the waitlist from WZRD, then continue to Air when you are ready.</p><label htmlFor="wzrd-air-name">Name</label><input id="wzrd-air-name" name="name" autoComplete="name" required placeholder="Your name" /><label htmlFor="wzrd-air-email">Email</label><input id="wzrd-air-email" name="email" type="email" inputMode="email" autoComplete="email" required placeholder="you@studio.com" /><label htmlFor="wzrd-air-phone">Phone / iMessage number</label><input id="wzrd-air-phone" name="imessage" type="tel" inputMode="tel" autoComplete="tel" required placeholder="+1 415 555 0123" /><div className={styles.honeypot} aria-hidden="true"><label htmlFor="wzrd-air-company">Company website</label><input id="wzrd-air-company" name="company" tabIndex={-1} autoComplete="off" /></div><label className={styles.consent}><input type="checkbox" name="consent" required /><span>WZRD may contact me about Air access and onboarding.</span></label>{error && <p className={styles.error} role="alert">{error}</p>}<button className={styles.submit} type="submit" disabled={stage === "saving"}>{stage === "saving" ? "Saving your place…" : "Join the Air waitlist"}<span aria-hidden="true">↗</span></button></form> : <section className={styles.success} aria-labelledby="wzrd-air-waitlist-title"><p className={styles.kicker}>You’re on the Air waitlist</p><h2 id="wzrd-air-waitlist-title">Your place is saved.</h2><p className={styles.lede}>You are #{result?.position} of {result?.totalWaiting}. Continue to Air to finish onboarding when you are ready.</p><a className={styles.submit} href={AIR_ORIGIN}>Open Air <span aria-hidden="true">↗</span></a></section>}</div></dialog></Context.Provider>;
}
