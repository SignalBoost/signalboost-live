# Public international search pages

Owner-authorized scope: dedicated public pages for all eleven requested languages, preserving existing URLs and the same application infrastructure.

## Implementation

- Languages: en, es, pt, pl, ru, de, fr, it, ja, ko, ar.
- Each language has an overview at `/<locale>` and focused pages at `/<locale>/ai-website-builder`, `/<locale>/customer-reviews`, `/<locale>/ai-content`, and `/<locale>/ai-lab` (55 static public pages).
- Native authored copy is server-rendered, with self-canonical metadata, matching OpenGraph/Twitter descriptions, WebPage language metadata and reciprocal hreflang links. Every equivalent page family uses its English page for x-default.
- `/sitemap.xml` contains the original homepage and all 55 canonical localized pages, with reciprocal language annotations. `/robots.txt` advertises it and excludes internal route families. Robots exclusions are crawl hints, never an access-control mechanism.
- The original homepage and other existing URLs remain available. Footer links expose all localized landing pages to visitors and crawlers; language switches retain the current public topic. No geography, IP, or browser-language redirect is introduced.
- Public page content carries a native `lang` and direction in server HTML and a Content-Language response header. The shared root layout's initial html language remains English; hydration synchronizes the document language/direction to the public route. Arabic content is RTL from the server and names are bidi-isolated. No middleware or dynamic request dependency is added to the root layout.
- Existing client locale safety-net translation skips explicitly localized public content so stored application preferences cannot alter the page language. Public routes render their own translated navigation/footer and do not load the Concierge dock into their visible shell.

## Product language and privacy boundaries

Public-page readiness is separate from complete application readiness. The canonical application still has five active languages; all public pages disclose that the six application translations are pending. Do not enable partially translated app catalogs or weaken their release gates. Lab pages disclose account/rollout-dependent access and do not claim unrestricted availability or production performance.

The pages do not certify GDPR compliance, fabricate local offices, prices, customer ratings or legal guarantees. They link to the existing privacy/data and support information. Language is not a processing-residency policy.

Generic Portuguese covers Portuguese-speaking visitors. Region-specific variants such as pt-BR/pt-PT require genuinely adapted content before adding separate URLs/hreflang declarations; no duplicated country doorway pages are created.

## Verification and indexing

`saas/tests/publicInternationalSeo.node.test.ts` validates complete translations, all 55 canonical/alternate relationships, sitemap closure, unknown-route rejection, response headers and native-copy isolation. It is included in the Vercel production regression gate. Integration requires all existing checks plus an exact-head green Vercel Preview.

After deployment, verify the exact deployment revision and GET each public canonical, checking status, native content, canonical/hreflang tags, Content-Language, sitemap and Arabic direction. Search Console ownership/index coverage and actual Google indexing/rankings are external evidence; code and deployment do not establish them. Submit `https://itmounts.com/sitemap.xml` in the verified Search Console property when access is available. No paid advertising is configured.

Reference: https://developers.google.com/search/docs/specialty/international/localized-versions
