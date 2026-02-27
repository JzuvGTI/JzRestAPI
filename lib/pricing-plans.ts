export type PricingPlan = {
  name: "FREE" | "PAID" | "RESELLER";
  price: string;
  description: string;
  features: string[];
  highlight?: boolean;
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: "FREE",
    price: "Rp. 0",
    description: "Untuk trial dan testing integrasi cepat.",
    features: ["100 request/day", "Akses fitur basic", "1 API Key"],
  },
  {
    name: "PAID",
    price: "Rp. 5.000",
    description: "Untuk project production dengan limit lebih besar.",
    features: ["Unlock ALL API", "Dashboard panel API", "5000 request/day"],
    highlight: true,
  },
  {
    name: "RESELLER",
    price: "Rp. 15.000",
    description: "Untuk bisnis yang butuh banyak key dan akses penuh.",
    features: ["Unlock PAID features", "Unlock ALL API", "Create 25 API KEY"],
  },
];
