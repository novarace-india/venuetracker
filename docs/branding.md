# NovaRace Flow brand implementation

**Product:** NovaRace Flow. **Company:** NovaRace. **Descriptor:** Event check-in and gate operations.

The product name is a separate label beside the complete NovaRace logo. The supplied logo shapes, wordmark, spacing and proportions are preserved. The white lockup is used only on indigo, in accordance with the brand guide.

## Source assets

Reference folder: `/Volumes/Data/PythonProjects/Branding`.

- `Brandguide.pdf`: December 2023 guide, including logo-unit usage, negative logos, colours and patterns.
- `RGB logo without icons.png`: complete white logo unit used on indigo UI, email, report and guide headers.
- `RGB WEBSITE.png`: supplied full-colour website logo, retained as an optimised complete unit.

Optimised, proportionally resized PNGs are checked into `apps/web/public/brand` and `apps/api/assets/brand`. The original files in the Branding folder are not modified. Normal app builds and Docker deployment use the checked-in assets and do not require access to the Branding directory.

## Palette

| Role                               | Brand colour        |
| ---------------------------------- | ------------------- |
| Main identity, headings, buttons   | Indigo `#282462`    |
| Secondary accents and chart series | Sky `#3FA9F5`       |
| Chart series and accents           | Magenta `#E6007D`   |
| Chart series and accents           | Amber `#FBB03B`     |
| Chart series and accents           | Lime `#C7CC00`      |
| Body colour / neutral series       | Charcoal `#333333`  |
| Secondary body colour              | Grey `#606060`      |
| Page background                    | Off-white `#FCFCFC` |

Indigo buttons with white text preserve contrast. Scanner green, amber and red outcomes retain their operational meanings; brand accents are not substituted for scan results.

## Identity surfaces

The reusable UI lockup is `apps/web/src/Brand.tsx`. Shared copy and colours are defined in `packages/shared/src/brand.ts`. The app title, scanner manifest/icons, login, admin navigation, scanner kiosk, pass emails, CSV filenames, Excel report identity, PDF reports and onboarding guides use NovaRace Flow.

Run `npm run brand:assets` only when intentionally refreshing copies from the source folder. Run `npm run icons` to regenerate install icons from the checked-in complete logo. The shared package must be built after changing brand constants. Guide PDFs can be regenerated with `python3 scripts/create_onboarding_guide.py` after the browser test refreshes the demonstration scanner screenshot.

## Upgrade safety

Branding does not change signing secrets, QR payload format, participant tokens, database paths, user credentials, pairing tokens, scan operation IDs, session-cookie name, local storage keys or the IndexedDB queue. These identifiers still contain some original internal names by design. Existing passes and queued operations continue to use the same server protocol.

The manifest start URL (`/scanner`), scope and existing service-worker update policy stay unchanged to preserve installed app identity. A device can briefly show the earlier brand until it finishes a normal update. Sync first, close and reopen app windows, and never clear browser data or uninstall while scans are pending.

Generated guides have NovaRace Flow filenames. The original GateCheck-named PDF paths are kept as compatibility aliases containing the new branded documents. Historical design specifications retain the original project name as a record of earlier approvals.
