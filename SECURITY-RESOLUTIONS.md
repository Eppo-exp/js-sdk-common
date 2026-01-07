# Security Resolutions

This document explains the yarn resolutions applied in package.json for security purposes.

## js-yaml

**Resolution:** `^4.1.1`

**Reason:** Addresses security vulnerability GHSA-mh29-5h37-fv8m

**Advisory:** https://github.com/advisories/GHSA-mh29-5h37-fv8m

**Description:** Forces all transitive dependencies to use js-yaml version 4.1.1 or higher, which contains the security patch. The vulnerable versions (<3.14.2 in the 3.x line, and <4.1.1 in the 4.x line) are transitively included via:
- eslint → js-yaml
- @istanbuljs/load-nyc-config (via jest) → js-yaml

This resolution ensures all instances use the patched version 4.1.1+.
