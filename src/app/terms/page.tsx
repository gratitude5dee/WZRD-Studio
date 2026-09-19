import type { Metadata } from "next";

import { LEGAL_CONTACT_EMAIL, LegalPage } from "@/app/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service | Air by WZRD Tech",
  description: "Terms of Service for Air by WZRD Tech, Inc.",
  alternates: { canonical: "https://wzrd.tech/terms" },
};

export default function TermsPage() {
  return <LegalPage title="Terms of Service" summary="The rules for using Air, WZRD Tech’s private-beta personal workspace." sections={[
    { id: "agreement", title: "1. Agreement", body: <p>These Terms govern your use of Air, including its website, waitlist, onboarding, and related services. By using Air, you agree to these Terms and the Privacy Policy. If you use Air for an organization, you represent that you may bind that organization.</p> },
    { id: "beta", title: "2. Private beta", body: <p>Air is an evolving private-beta product. Features, availability, supported integrations, and access may change, be limited, or be withdrawn. Access may require waitlist approval, onboarding, or additional feature-specific terms.</p> },
    { id: "content", title: "3. Your content and accounts", body: <p>You are responsible for the information, credentials, connected accounts, and content you provide. You retain ownership of your content and grant WZRD Tech, Inc. a limited license to host, process, transmit, and display it only as needed to provide, secure, and improve Air.</p> },
    { id: "ai", title: "4. AI-assisted outputs", body: <><p>Air may generate or organize content using automated systems. Outputs may be inaccurate, incomplete, or unsuitable for your situation. You are responsible for reviewing outputs and for decisions or actions taken from them.</p><p>Air does not provide legal, medical, financial, tax, employment, investment, or other professional advice. Do not use Air to make high-impact decisions about people without appropriate human review and authorization.</p></> },
    { id: "use", title: "5. Acceptable use", body: <p>You may not use Air to violate law or others’ rights; bypass security controls; submit malware; harvest data; impersonate others; generate or distribute unlawful, deceptive, abusive, or infringing content; or interfere with the service or other users.</p> },
    { id: "changes", title: "6. Changes and termination", body: <p>We may modify, suspend, or discontinue Air or these Terms. We may suspend or terminate access when reasonably necessary to protect users, the service, or others, or for a breach of these Terms. Material changes will be communicated where required by law.</p> },
    { id: "disclaimers", title: "7. Disclaimers", body: <p>To the maximum extent permitted by law, Air is provided “as is” and “as available.” WZRD Tech, Inc. disclaims warranties not expressly stated in these Terms, including warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, and uninterrupted availability.</p> },
    { id: "contact", title: "8. Contact", body: <p>Questions about these Terms can be sent to <a className="text-sky-200 underline underline-offset-4" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.</p> },
  ]} />;
}
