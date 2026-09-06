# Hardware catalog seed data (2026-09-03)

Transcribed source data for the hardware catalog (plan: ~/.claude/plans/hardware-catalog.md).

- `a325-bolt-sets.csv` - AISC table "Weight of ASTM A325 or A490 high strength bolts" (docs/A325.pdf): lb per 100 for bolt + heavy hex nut, by diameter (1/2"-1-1/2") and length under head (1"-9" by 1/4"). `set_weight_each_lb` adds one plain round washer. Per-inch adders included for lengths beyond the table.
- `kwik-bolt.csv` - Hilti Kwik-Bolt concrete anchors (docs/KWIK BOLTS.pdf): description-column sizes 1/4"-1-1/4"; weights from the handwritten wt column (= box weight / box qty, checked against the printed box weights). 1/2" x 5-1/2" is the shop default (circled on the sheet). The printed prices on that sheet are decades old and are not used.
- `hilti-has-rods.csv` - Hilti HAS threaded anchor rods, standard off-the-shelf program (Hilti Anchor Rod Specifications, Jan 2025, p.13) for HAS-V-36, HAS-E-55 and HAS-B-105 HDG, with hole (bit) diameter and effective embedment range from the Anchor Fastening Technical Guide Ed. 22, Table 38 (HIT-HY 200 V3), identical to Table 24 (HIT-RE 500 V3). Weights are ESTIMATES (all-thread lb/in x length + heavy hex nut + F436 washer); Hilti does not publish rod weights.

Adhesive: HIT-HY 200-A/R V3 and HIT-RE 500 V3 come in 11.1 fl oz (330 ml, 20.1 in^3) and 16.9 fl oz (500 ml, 30.5 in^3) foil packs. Hilti publishes no imperial anchors-per-cartridge table; volume per anchor = pi/4 x (bit_dia^2 - rod_dia^2) x embedment (+ waste), pooled per item and rounded up to whole cartridges.

1-1/2" rods: available in Hilti's extended (cut-to-length) program, but neither HIT-HY 200 V3 nor HIT-RE 500 V3 publishes ICC setting data above 1-1/4"; a 1-1/2" entry would carry an assumed 1-5/8" bit and EOR-specified embedment.

Prices: none of these sources carry current pricing; unit prices are to be seeded from list prices (McMaster-Carr for reference only; no vendor part numbers stored) and edited on Global Pricing Data.

## Pricing (added 2026-09-03)

- `hilti-has-rods.csv` now carries `unit_price` = Hilti.com net price on Berger's account, small pack (10/20 pc) price divided by pack quantity. Box (MC) and pallet prices are lower per piece; the small-pack figure is the conservative job-quantity price.
- `kwik-bolt-tz2.csv` replaces the classic Kwik-Bolt list for seeding: Hilti's current carbon-steel wedge anchor is the Kwik Bolt TZ2 (1/4"-1"; no 1-1/4"). Sizes are Hilti's current offering; weights are Todd's sheet values where the size matches exactly, otherwise a straight-line fit of Todd's weights for that diameter. Default stays 1/2" x 5-1/2". The original `kwik-bolt.csv` is kept as the weight source.
- `adhesives.csv`: HIT-HY 200 V3 (HY 200-A), HIT-RE 500 V3, HIT-HY 270 — single 330 ml cartridge net price (case price noted for reference).
- A325 sets: no Hilti source; see the seed script / admin for how those are priced.

## A325 vendor pricing (2026-09-04)

- `a325-pricing-2026-09.csv` is the vendor's response to `docs/A325-pricing-request.xlsx`
  (returned as `docs/A325-pricing.xlsx`), one line per diameter x length with a plain and/or
  HDG price per set; blank = vendor had no price. Loaded by `scripts/load-a325-pricing.mjs`
  (`--dry` to preview): plain price -> Plain item priced; no plain price -> Plain item hidden
  (kept for old estimate rows); HDG price -> `finish=HDG` variant row created (the estimator
  swaps galvanized Hardware rows to it); Todd's rule: only sizes the vendor could price show.
- Vendor notes on the sheet: DH nuts subbed with A194-2H, prices current, availability sparse,
  parts require a requote for purchase, all sets unassembled.
- Sixteen sizes came back with HDG cheaper than plain (e.g. 1-1/4" x 4": $9.14 plain vs $7.12
  HDG); loaded as given, worth a question to the vendor.
- Result: 82 plain + 79 HDG priced and active, 50 plain sizes hidden. Hidden sizes can be
  re-enabled on Global Pricing Data -> Hardware.

## F1554 anchor rods (2026-09-05)

- `f1554-anchor-rods.csv`: cast-in anchor rod assemblies, F1554 Gr36 and Gr50, 3/4", 1", 1-1/4"
  and 1-1/2" in 12", 18", 24" and 36" lengths. Todd outsources these; they are priced per each
  and the price includes the heavy hex nuts and washers (plate washers when the detail calls
  for them). Seeded Plain and HDG (bought pre-galvanized: a galvanized Hardware row swaps to
  the HDG variant and never adds weight to a galv dip). Weights are estimates (round bar lb/ft
  x length + two heavy hex nuts + one F436 washer). No vendor prices yet: rows seed at $0 and
  are priced on Global Pricing Data -> Hardware. Default: Gr36 3/4" x 18".
- The auto-takeoff's base plate step names the rods it reads off the typical column base
  plate detail in the plate row's note (e.g. "(4) 3/4\" F1554-55 anchor rods x 1'-0\" embed");
  Grade 55 (IAH100's spec) was added 2026-09-06 with the same sizes.
