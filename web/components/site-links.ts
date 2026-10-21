// Links shared by the header, footer and phone tab bar, so the three agree.

export const NAV_LINKS = [
  { href: "/shops", label: "Shops" },
  { href: "/sell/apply", label: "Sell" },
  { href: "/pickup", label: "Pickup & refunds" },
  { href: "/faq", label: "FAQ" },
] as const;

export const FOOTER_COLUMNS = [
  {
    title: "Shop",
    links: [
      { href: "/shops", label: "Browse shops" },
      { href: "/pickup", label: "Pickup & refunds" },
    ],
  },
  {
    title: "Sell",
    links: [
      { href: "/sell/apply", label: "Apply to sell" },
      { href: "/login?next=/seller", label: "Seller login" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/about", label: "About" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
    ],
  },
] as const;

export const CONTACT_EMAIL = "hello@neighborhoodcandylady.com";
