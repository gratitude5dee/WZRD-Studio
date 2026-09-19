import type { Metadata } from "next";

import { LEGAL_CONTACT_EMAIL, LegalPage } from "@/app/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | Air by WZRD Tech",
  description: "Privacy Policy for Air by WZRD Tech, Inc.",
  alternates: { canonical: "https://wzrd.tech/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" summary="How Air handles waitlist, onboarding, product, and account information." sections={[
    { id: "scope", title: "1. Scope", body: <p>This Privacy Policy explains how WZRD Tech, Inc. collects, uses, shares, retains, and protects personal information when you use Air, join the waitlist, book onboarding, contact us, or otherwise interact with the service.</p> },
    { id: "collect", title: "2. Information we collect", body: <><p>Depending on how you use Air, we may collect:</p><ul className="list-disc space-y-2 pl-5"><li>Waitlist and onboarding details, including name, email address, phone or iMessage number, referral details, consent status, and timestamps.</li><li>Account, support, and communications information you provide.</li><li>Content, instructions, files, and connected-service data you choose to submit or authorize Air to process.</li><li>Technical and usage information, including device/browser data, IP-derived security signals, diagnostics, and interaction events.</li></ul></> },
    { id: "use", title: "3. How we use information", body: <p>We use information to operate and secure Air; manage waitlist access and onboarding; respond to requests; provide support; prevent fraud and abuse; understand and improve the service; and comply with law.</p> },
    { id: "providers", title: "4. AI and service providers", body: <p>Air may use infrastructure, database, analytics, scheduling, communications, storage, and AI service providers to operate the service. These providers may process information on our instructions and subject to appropriate safeguards. We do not sell personal information for money.</p> },
    { id: "sharing", title: "5. When we share information", body: <p>We share information with providers that support Air; recipients you direct us to share with; professional advisers and transaction counterparties where needed; and parties where required to comply with law, enforce our terms, protect rights and safety, or respond to valid legal process.</p> },
    { id: "retention", title: "6. Retention and security", body: <p>We retain personal information only for as long as reasonably necessary for the purposes described here, including security, dispute resolution, backups, and legal obligations. We use reasonable organizational, technical, and physical safeguards, but no internet service is completely secure.</p> },
    { id: "rights", title: "7. Your choices and rights", body: <p>You may request access, correction, deletion, or a copy of personal information, and opt out of non-essential marketing communications. Depending on your location, you may have additional rights. We may need to verify a request before acting on it.</p> },
    { id: "children", title: "8. Children", body: <p>Air is not directed to children. Do not use or provide personal information to Air if you are below the minimum age required in your location without any legally required consent.</p> },
    { id: "changes", title: "9. Changes to this Policy", body: <p>We may update this Policy as our product or practices change. We will post the updated version with a revised effective date and provide additional notice when required by law.</p> },
    { id: "contact", title: "10. Contact", body: <p>For privacy questions or requests, email <a className="text-sky-200 underline underline-offset-4" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.</p> },
  ]} />;
}
