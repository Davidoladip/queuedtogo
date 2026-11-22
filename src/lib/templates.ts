// Starting points for new event forms: each template is a complete form (questions, colours, fonts, texture,
// layout and cover) for one kind of event, so businesses can see how different events can look and be arranged.
// Everything can be changed in the builder afterwards.
import { blankField, normalizeDesign, normalizeSettings, starterFields, type FormField, type FormModel, type Theme } from "@/lib/design/engine";
import { LOOKS } from "@/lib/design/looks";
import { normalizeSwatches } from "@/lib/design/media";
import { normalizeTickets } from "@/lib/pricing";

export type TemplateGroup = "orders" | "tickets" | "rsvp";
export const TEMPLATE_GROUPS: { key: TemplateGroup; title: string; blurb: string }[] = [
  { key: "orders", title: "Take orders", blurb: "Customers order at your stall or table, and each order becomes a job on your board." },
  { key: "tickets", title: "Sell tickets", blurb: "Guests pick tickets and pay online with your Stripe or Square account." },
  { key: "rsvp", title: "Collect RSVPs", blurb: "Guests reply yes, no or maybe, and you see who's coming." },
];

export type Template = {
  key: string;
  group: TemplateGroup;
  name: string;
  /** One line: what kind of event it suits. */
  blurb: string;
  /** Shown as the example in the event name field. */
  example: string;
  build: () => FormModel;
};

// ---------------------------------------------------------------- helpers

function field(type: Parameters<typeof blankField>[0], label: string, extra: Partial<FormField> = {}): FormField {
  const f = blankField(type);
  f.label = label;
  Object.assign(f, extra);
  return f;
}

type Look = {
  theme: Partial<Theme>;
  page?: { tex: string; texColor: string; texOp: number; texScale: number };
  card?: { tex: string; texColor: string; texOp: number; texScale: number };
};

function model(title: string, opts: {
  mode?: "order" | "rsvp";
  intro: string;
  venue?: string;
  thanks: string;
  submit: string;
  look: Look;
  fields: FormField[];
  cover?: Partial<FormModel["settings"]["cover"]>;
  rsvp?: Record<string, unknown>;
}): FormModel {
  const design = normalizeDesign({ theme: { page: "#2B2F4A", card: "#FFFFFF", text: "#1A1D2E", accent: "#3346D3", accentText: "#FFFFFF", radius: "rounded", font: "clean", layout: "banner", ...opts.look.theme } });
  if (opts.look.page) design.page = { ...design.page, ...opts.look.page };
  if (opts.look.card) design.card = { ...design.card, ...opts.look.card };
  const settings = normalizeSettings({ mode: opts.mode ?? "order", ...(opts.rsvp ? { rsvp: opts.rsvp } : {}) });
  if (opts.cover) settings.cover = { ...settings.cover, ...opts.cover, envelope: { ...settings.cover.envelope, ...(opts.cover.envelope ?? {}) } };
  return {
    id: "00000000-0000-4000-8000-000000000000",
    title,
    slug: "template",
    eventDate: null,
    venue: opts.venue ?? "",
    intro: opts.intro,
    thanks: opts.thanks,
    submitLabel: opts.submit,
    settings,
    design,
    fields: [...opts.fields, blankField("submit")],
  };
}

const name = () => field("short", "Your name", { required: true });
const phone = (help = "We'll text you when your order is ready.") => field("phone", "Mobile number", { required: true, help });
const email = (help = "") => field("email", "Email", { required: true, help });

function tickets(label: string, types: { name: string; price: number; qty?: number }[]): FormField {
  const f = field("tickets", label, { required: true, options: types.map((t) => t.name) });
  f.config.tickets = normalizeTickets(types.map((t) => ({ price: t.price, qty: t.qty ?? 100, max: 8 })), types.length);
  return f;
}

// ---------------------------------------------------------------- templates

export const TEMPLATES: Template[] = [
  {
    key: "market-stall",
    group: "orders",
    name: "Market stall",
    blurb: "Pop-up shops, craft fairs and markets selling made-to-order goods.",
    example: "Holiday Makers Market",
    build: () => model("Holiday Makers Market", {
      intro: "Order at the stall and keep browsing. We'll text you when it's ready to collect.",
      thanks: "Thanks! Your order is in the queue. We'll text you when it's ready at the stall.",
      submit: "Place my order",
      look: {
        theme: { page: "#F3E3C3", card: "#FFFDF7", text: "#2B2118", accent: "#C2412D", accentText: "#FFFFFF", font: "friendly", radius: "rounded" },
        page: { tex: "checks", texColor: "#C2412D", texOp: 16, texScale: 22 },
      },
      fields: [name(), phone(),
        field("choice", "What would you like?", { required: true, options: ["Candle", "Tote bag", "Mug", "Gift set"] }),
        field("sizes", "How many of each size?", { options: ["S", "M", "L", "XL"] }),
        field("long", "Anything we should know?", { placeholder: "Gift wrap, a name to add, a colour you prefer…" })],
    }),
  },
  {
    key: "live-personalisation",
    group: "orders",
    name: "Live personalisation",
    blurb: "Embroidery, engraving, printing or monogramming done on the spot.",
    example: "Spring Monogram Bar",
    build: () => {
      const thread = field("choice", "Thread colour", { required: true, options: ["Gold", "Navy", "Blush", "White"] });
      thread.config.swatches = normalizeSwatches({ items: [{ color: "#C9A227", label: "Gold" }, { color: "#1F2A4D", label: "Navy" }, { color: "#E8A8B4", label: "Blush" }, { color: "#FFFFFF", label: "White" }], size: 30, selectable: false, labels: true });
      return model("Spring Monogram Bar", {
        intro: "Choose your item and how you'd like it personalised. We'll stitch it while you enjoy the event.",
        thanks: "Thanks! We'll start stitching soon and text you when it's ready.",
        submit: "Send my order",
        look: {
          theme: { page: "#1F2A4D", card: "#FFFFFF", text: "#1F2A4D", accent: "#C9A227", accentText: "#1F2A4D", font: "classic", radius: "slight" },
          page: { tex: "stitch", texColor: "#C9A227", texOp: 22, texScale: 26 },
        },
        fields: [name(), phone(),
          field("choice", "Item", { required: true, options: ["Toiletry bag", "Tote bag", "Baby blanket", "Hat"] }),
          field("short", "Name or initials to add", { required: true, placeholder: "e.g. AVA or A.R.J.", help: "Up to 10 letters." }),
          field("choice", "Lettering style", { required: true, options: ["Script", "Block", "Serif"] }),
          thread],
      });
    },
  },
  {
    key: "food-truck",
    group: "orders",
    name: "Food truck",
    blurb: "Food stands and festivals: order from the menu and collect when called.",
    example: "Harbourfront Food Fest",
    build: () => model("Harbourfront Food Fest", {
      intro: "Skip the line: order here and we'll text you the moment it's ready at the window.",
      thanks: "Order received! Watch your phone, we'll text you when it's up.",
      submit: "Order now",
      look: {
        theme: { page: "#D7261E", card: "#FFF8EC", text: "#231A14", accent: "#231A14", accentText: "#FFD23F", font: "poster", radius: "square", layout: "side" },
        page: { tex: "stripes", texColor: "#FFFFFF", texOp: 14, texScale: 28 },
      },
      fields: [name(), phone("We'll text you when it's ready at the window."),
        field("multi", "What are you having?", { required: true, options: ["Smash burger", "Fish tacos", "Loaded fries", "Veggie bowl"] }),
        field("number", "How many people is this for?", { placeholder: "1" }),
        field("dropdown", "Pickup", { required: true, options: ["As soon as it's ready", "In 15 minutes", "In 30 minutes"] })],
    }),
  },
  {
    key: "merch-table",
    group: "orders",
    name: "Merch table",
    blurb: "Concerts, tours and team events selling shirts and hoodies by size.",
    example: "Night Shift Tour Merch",
    build: () => model("Night Shift Tour Merch", {
      intro: "Pick your gear and sizes. Grab it from the merch table when we text you.",
      thanks: "You're in the queue. We'll text you when your merch is bagged and ready.",
      submit: "Reserve my merch",
      look: {
        theme: { page: "#12101A", card: "#1E1B2B", text: "#F4F1FF", accent: "#FF4FA3", accentText: "#12101A", font: "sporty", radius: "slight", layout: "background" },
        page: { tex: "grain", texColor: "#FF4FA3", texOp: 18, texScale: 18 },
      },
      fields: [name(), phone(),
        field("choice", "Item", { required: true, options: ["Tour tee", "Hoodie", "Poster", "Cap"] }),
        field("sizes", "Sizes", { options: ["S", "M", "L", "XL", "XXL"] })],
    }),
  },
  {
    key: "concert-night",
    group: "tickets",
    name: "Concert night",
    blurb: "Gigs, comedy nights and shows with general and VIP tickets.",
    example: "Friday Night Live",
    build: () => model("Friday Night Live", {
      intro: "Doors at 7pm, show at 8pm. Choose your tickets and pay securely online.",
      venue: "The Warehouse",
      thanks: "You're going! Your order number is your ticket: give it, or your name, at the door.",
      submit: "Get tickets",
      look: {
        theme: { page: "#2A1238", card: "#FFF6E9", text: "#2A1238", accent: "#F2A93B", accentText: "#2A1238", font: "retro", radius: "rounded" },
        page: { tex: "dots", texColor: "#F2A93B", texOp: 22, texScale: 20 },
      },
      fields: [tickets("Choose your tickets", [{ name: "General admission", price: 2500 }, { name: "VIP (front row + drink)", price: 6000, qty: 30 }]), name(), email("So we can reach you about your booking.")],
    }),
  },
  {
    key: "workshop",
    group: "tickets",
    name: "Workshop or class",
    blurb: "Classes, tastings and workshops with limited seats.",
    example: "Sourdough Basics Workshop",
    build: () => model("Sourdough Basics Workshop", {
      intro: "A hands-on morning: you'll leave with your own starter and a fresh loaf. All materials included.",
      thanks: "Your seat is booked. We'll email the details a few days before.",
      submit: "Book my seat",
      look: {
        theme: { page: "#E6EDE3", card: "#FFFFFF", text: "#1E2B22", accent: "#2F6B4F", accentText: "#FFFFFF", font: "modern", radius: "rounded", layout: "side" },
        page: { tex: "linen", texColor: "#2F6B4F", texOp: 12, texScale: 16 },
      },
      fields: [tickets("Seats", [{ name: "One seat", price: 4500, qty: 12 }, { name: "Two seats (bring a friend)", price: 8000, qty: 6 }]), name(), email("We'll email your booking and reminders here."),
        field("long", "Allergies or anything we should know?")],
    }),
  },
  {
    key: "wedding",
    group: "rsvp",
    name: "Wedding",
    blurb: "A sealed envelope that opens to an ivory and gold invitation.",
    example: "Amara & Daniel's Wedding",
    build: () => {
      const f = model("Amara & Daniel's Wedding", {
        mode: "rsvp",
        intro: "We would be honoured to celebrate with you. Kindly reply by the date on your invitation.",
        venue: "The Grand Hall",
        thanks: "",
        submit: "Send my reply",
        look: { theme: {} },
        rsvp: { start: "16:00", end: "23:00" },
        cover: { on: true, text: "Together with their families\n{form_title}\nrequest the pleasure of your company." },
        fields: [field("rsvp", "Will you be joining us?"), name(), email("We'll email your confirmation and a link to change your reply."),
          field("choice", "Dinner choice", { options: ["Beef", "Fish", "Vegetarian"] }),
          field("long", "A note for the couple")],
      });
      LOOKS.luxury.apply(f);
      return f;
    },
  },
  {
    key: "birthday",
    group: "rsvp",
    name: "Birthday party",
    blurb: "Bright and playful: birthdays, graduations and celebrations.",
    example: "Maya Turns 30",
    build: () => model("Maya Turns 30", {
      mode: "rsvp",
      intro: "Cake, music and way too much glitter. Let us know if you can make it!",
      venue: "Rooftop at The Lark",
      thanks: "",
      submit: "Count me in",
      look: {
        theme: { page: "#FFD6E8", card: "#FFFFFF", text: "#3A1240", accent: "#7A2BD9", accentText: "#FFFFFF", font: "party", radius: "pill" },
        page: { tex: "dots", texColor: "#7A2BD9", texOp: 26, texScale: 18 },
      },
      rsvp: { start: "19:00", end: "23:30" },
      cover: { on: true, heading: "You're invited!", text: "Come celebrate {form_title}.", button: "Open the invite", sparkle: true },
      fields: [field("rsvp", "Can you make it?"), name(), email(), field("short", "Song request", { placeholder: "Something to dance to" })],
    }),
  },
  {
    key: "baby-shower",
    group: "rsvp",
    name: "Baby shower",
    blurb: "Soft pastels for showers, christenings and gender reveals.",
    example: "Baby Okafor Shower",
    build: () => model("Baby Okafor Shower", {
      mode: "rsvp",
      intro: "Join us for a gentle afternoon of tea, games and good wishes for the little one.",
      thanks: "",
      submit: "Send my RSVP",
      look: {
        theme: { page: "#DCEBF2", card: "#FFFDFB", text: "#3D4A5C", accent: "#B84A63", accentText: "#FFFFFF", font: "whimsical", radius: "rounded" },
        page: { tex: "waves", texColor: "#FFFFFF", texOp: 40, texScale: 30 },
      },
      rsvp: { start: "14:00", end: "17:00" },
      cover: { on: true, heading: "Oh baby!", text: "You're invited to {form_title}.", button: "See the details" },
      fields: [field("rsvp", "Will you be there?"), name(), email(), field("long", "Words of wisdom for the parents-to-be")],
    }),
  },
  {
    key: "community",
    group: "rsvp",
    name: "Community meetup",
    blurb: "Clean and simple: meetups, open days, launches and talks.",
    example: "Neighbourhood Open Day",
    build: () => model("Neighbourhood Open Day", {
      mode: "rsvp",
      intro: "Free to attend. Reply so we know how many chairs and coffees to set out.",
      venue: "Main Street Library",
      thanks: "",
      submit: "Reply",
      look: {
        theme: { page: "#FFFFFF", card: "#F4F6FA", text: "#14213D", accent: "#1F6FEB", accentText: "#FFFFFF", font: "minimal", radius: "slight", layout: "side" },
        page: { tex: "grid", texColor: "#14213D", texOp: 8, texScale: 24 },
      },
      rsvp: { start: "10:00", end: "15:00" },
      fields: [field("rsvp", "Are you coming?"), name(), email(), field("choice", "How did you hear about us?", { options: ["A friend", "Social media", "A flyer", "Other"] })],
    }),
  },
];

export const BLANK_TEMPLATE_KEY = "blank";
export const templateByKey = (key: string) => TEMPLATES.find((t) => t.key === key) ?? null;

/** The plain starting point (the original default): a few common order questions on the default theme. */
export function blankTemplate(title: string): FormModel {
  return { ...model(title, { intro: "", thanks: "Thanks! We've got your order and will send you updates as it moves along.", submit: "Place my order", look: { theme: {} }, fields: [] }), fields: starterFields() };
}

/**
 * Gives an existing form the look of a template: colours, fonts, texture, layout and element styles. Questions,
 * text, artwork and settings stay as they are (the wedding look also dresses the cover and envelope).
 */
export function applyTemplateLook(d: FormModel, key: string): boolean {
  if (key === "wedding") { LOOKS.luxury.apply(d); return true; }
  const t = templateByKey(key);
  if (!t) return false;
  const src = t.build().design;
  d.design.theme = { ...src.theme, layout: src.theme.layout };
  d.design.page = { ...src.page };
  d.design.card = { ...src.card };
  d.design.shared = structuredClone(src.shared);
  for (const k of ["__title", "__intro", "__ctitle", "__ctext", "__cbtn"]) {
    if (src.el[k]) d.design.el[k] = structuredClone(src.el[k]);
    else delete d.design.el[k];
  }
  return true;
}
