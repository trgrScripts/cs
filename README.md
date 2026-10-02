# Keyless: CS2 case opener

Open every CS2 weapon case, sticker capsule, autograph capsule, souvenir package, patch/pin pack and music kit box for free, and keep what you unbox.

## Play

No build step and no server needed. Download or clone the repo and open `index.html` in your browser.

You can also host it for free with GitHub Pages (Settings → Pages → deploy from this branch, root folder).

## What's in it

- **471 containers** with their real contents: 44 weapon cases, 100 sticker capsules, 139 autograph capsules, 164 souvenir packages, 11 patch/pin packs and 13 music kit boxes.
- **The CS2 unlock screen.** Click a case to get the "Unlock Container" screen: the case, a "Contains one of the following" strip with the yellow ★ tile, and the key bar. Unlocking plays the horizontal reel with tick sounds and stops on your drop. You can open 1, 2, 3, 5 or 10 at once, or turn on Quick to skip the reel.
- **Real odds.** Weapon cases use Valve's published rates: Mil-Spec 79.92%, Restricted 15.98%, Classified 3.20%, Covert 0.64%, ★ Rare Special 0.26%. Capsules and souvenir packages use the same 1-in-5 step between grades.
- **Float system like the game.** Each skin gets a wear value inside its own float cap, shown at full 32-bit precision, with its exterior (FN/MW/FT/WW/BS), a pattern seed from 0 to 999, and a 10% StatTrak™ chance in weapon cases.
- **Knives and gloves.** Every finish in the case's gold pool, including Doppler and Gamma Doppler phases (Ruby, Sapphire, Black Pearl and Emerald are rare).
- **Market prices** for every item, wear, StatTrak™ and Souvenir variant, Doppler phases included, plus case prices. A price marked `~` is estimated from the nearest wear because nothing sold at that exact wear.
- **Simulator.** Open up to 10 million containers in a few seconds and see what you spent, what it's worth, your profit or loss, your best drops and the lowest float. You choose which drops, if any, go into your inventory.
- **Inventory** saved in your browser (IndexedDB, up to 250,000 items). Search, filter, sort by price or float, inspect, favourite, bulk-delete, or wipe it all.
- **Trade-up contracts.** 10 items of one grade become 1 item of the next grade from the same cases. 5 Coverts become a knife or gloves. Shows the input cost and the expected return before you sign.
- **Stats.** Your drop distribution against the odds, golds against the expected number, inventory value, lowest float and recent drops. You can back up and restore your inventory as a JSON file.

## Prices

`js/prices.js` is rebuilt every day by the **Update prices** GitHub Action (`.github/workflows/prices.yml`), which runs `scripts/build_prices.py` and commits the result. Each source fills only the items the earlier ones lack:

1. Skinport (median of recent sales; the only source for Doppler phases)
2. market.csgo.com
3. Steam Community Market listings

You can run it by hand from the Actions tab (Update prices → Run workflow), or locally with `python3 scripts/build_prices.py`.

## Updating the item data

`js/data.js` is generated from the open [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API) dataset. To pull in new cases:

```sh
python3 scripts/build_data.py
```

Saved inventories reference items by stable keys, so they survive a data rebuild.

## Notes

Images load from Steam's CDN. Floats use the community-measured wear distribution (FN 3%, MW 24%, FT 33%, WW 24%, BS 16% before the float cap is applied), and Doppler phase rates are estimates. This project isn't affiliated with Valve, and no real money or items are involved.
