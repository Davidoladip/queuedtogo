import { FAQ } from "@/lib/faq";
import { LEGAL } from "@/lib/legal";
import { PASSES, PASS_ORDER, PLANS, PLAN_ORDER } from "@/lib/plans";
import { SITE_URL } from "@/lib/site";

const ORG_ID = `${SITE_URL}/#organization`;

/** Schema.org data for the homepage: who runs it, what the product is and costs, and the FAQ. All from live data. */
export function homepageStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: "QueuedToGo",
        legalName: LEGAL.operator,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/icon.png`,
        email: LEGAL.contactEmail,
        address: { "@type": "PostalAddress", addressLocality: "Glen Burnie", addressRegion: "MD", addressCountry: "US" },
      },
      { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: "QueuedToGo", publisher: { "@id": ORG_ID }, inLanguage: "en-US" },
      {
        "@type": "SoftwareApplication",
        name: "QueuedToGo",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: `${SITE_URL}/`,
        description: "Take orders at your event with a QR-code form, sell tickets to paid events, and send RSVP invitations. Work through orders on a production board and text customers when they're ready.",
        publisher: { "@id": ORG_ID },
        image: `${SITE_URL}/og.png`,
        offers: [
          ...PLAN_ORDER.map((k) => ({
            "@type": "Offer",
            name: `${PLANS[k].name} plan`,
            price: String(PLANS[k].price),
            priceCurrency: "USD",
            ...(PLANS[k].price > 0 ? { priceSpecification: { "@type": "UnitPriceSpecification", price: String(PLANS[k].price), priceCurrency: "USD", unitCode: "MON" } } : {}),
          })),
          ...PASS_ORDER.map((t) => ({ "@type": "Offer", name: `Event pass, ${PASSES[t].name.toLowerCase()}`, price: String(PASSES[t].price), priceCurrency: "USD" })),
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}
