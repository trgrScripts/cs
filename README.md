# Keyless: CS2 case opener

Open every CS2 weapon case, sticker capsule, autograph capsule, souvenir package, patch/pin pack and music kit box for free, and keep what you unbox.

## Play

No build step and no server needed. Download or clone the repo and open `index.html` in your browser.

You can also host it for free with GitHub Pages (Settings → Pages → deploy from this branch, root folder).

## What's in it

- **471 containers** with their real contents: 44 weapon cases, 100 sticker capsules, 139 autograph capsules, 164 souvenir packages, 11 patch/pin packs and 13 music kit boxes.
- **Real odds.** Weapon cases use Valve's published rates: Mil-Spec 79.92%, Restricted 15.98%, Classified 3.20%, Covert 0.64%, ★ Rare Special 0.26%. Capsules and souvenir packages use the same 1-in-5 step between grades.
- **Float system like the game.** Each skin gets a wear value inside its own float cap (for example, the AWP Asiimov can't be Factory New). The value is shown at full 32-bit precision, with its exterior (FN/MW/FT/WW/BS), a pattern seed from 0 to 999, and a 10% StatTrak™ chance in weapon cases.
- **Knives and gloves.** Every finish in the case's gold pool, including Doppler and Gamma Doppler phases (Ruby, Sapphire, Black Pearl and Emerald are rare).
- **The unbox reel.** A CS-style spinning strip with tick sounds. You can open 1, 2, 3, 5 or 10 at once, or turn on Quick open to skip the animation.
- **Inventory** saved in your browser. Search, filter by type and rarity, sort by float, inspect items, favourite them and bulk-delete.
- **Trade-up contracts.** 10 items of one grade become 1 item of the next grade from the same cases. 5 Coverts become a knife or gloves. The output float uses CS2's normalised averaging.
- **Stats.** Your drop distribution compared with the case odds, your golds compared with the expected number, your lowest float, recent drops, and how much you would have spent on keys.
- **Backup and restore** your inventory as a JSON file from the Stats page.

## Updating the item data

`js/data.js` is generated from the open [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API) dataset. To pull in new cases:

```sh
python3 scripts/build_data.py
```

Saved inventories reference items by stable keys, so they survive a data rebuild.

## Notes

Images load from Steam's CDN. Floats use the community-measured wear distribution (FN 3%, MW 24%, FT 33%, WW 24%, BS 16% before the float cap is applied), and Doppler phase rates are estimates. This project isn't affiliated with Valve, and no real money or items are involved.
