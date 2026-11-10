# Version kaise badhayein

- `version.json` me version badlo — ye ekmatra source of truth hai.
- Phir wahi number baaki jagah daalo: `app.js` me `APP_VERSION`, `index.html` me `?v=` (3) aur sidebar footer `vN`, `sw.js` me `CACHE_NAME` aur `APP_SHELL` ke `?v=` (3).
- Check chalao: `node scripts/check-version.mjs` — mismatch par exit code 1 aata hai; bina pass kiye push mat karo.
