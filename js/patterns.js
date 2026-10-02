/* Rare patterns: pattern seeds (0–999) that the market pays a premium for.
 *
 * Each rule matches skins by name (StatTrak™ and Souvenir copies match too) and lists
 * named tiers of seeds. `mult` multiplies the normal market price for that wear, so a
 * premium scales with exterior. These are well-known community seeds, not an exhaustive
 * list, and the multipliers are rough estimates of recent sales. Edit freely.
 */
window.CS_PATTERNS = [
  {
    names: ["AK-47 | Case Hardened"],
    tiers: [
      { label: "Blue Gem #661", short: "Blue Gem", style: "blue", mult: 2500, seeds: [661] },
      { label: "Tier 1 Blue Gem", short: "Blue Gem", style: "blue", mult: 150, seeds: [670, 321, 151, 955, 179, 387] },
      { label: "Tier 2 Blue Gem", short: "Blue Gem", style: "blue", mult: 15, seeds: [760, 828, 555, 868, 592, 617, 442, 463, 4, 103, 922, 341, 470, 168, 690, 809] },
    ],
  },
  {
    names: ["Five-SeveN | Case Hardened"],
    tiers: [
      { label: "Blue Gem #278", short: "Blue Gem", style: "blue", mult: 200, seeds: [278] },
      { label: "Blue Gem", short: "Blue Gem", style: "blue", mult: 40, seeds: [690, 868, 363, 872, 648] },
    ],
  },
  {
    names: ["★ Karambit | Case Hardened"],
    tiers: [
      { label: "Blue Gem #387", short: "Blue Gem", style: "blue", mult: 1000, seeds: [387] },
      { label: "Tier 1 Blue Gem", short: "Blue Gem", style: "blue", mult: 25, seeds: [269, 463, 73, 670, 442] },
    ],
  },
  {
    names: ["★ Karambit | Marble Fade", "★ Bayonet | Marble Fade", "★ M9 Bayonet | Marble Fade", "★ Flip Knife | Marble Fade", "★ Gut Knife | Marble Fade"],
    tiers: [
      { label: "Fire & Ice", short: "Fire & Ice", style: "fireice", mult: 3, seeds: [412, 16, 146, 241, 359, 393, 541, 602, 649, 688, 701] },
    ],
  },
];
