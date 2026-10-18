# Technology Fingerprint Catalog Reference

**Engine Version:** `2.0.0`  
**Catalog Version:** `2.0.0`  
**Total Technologies Supported:** `173`  

This document is the authoritative reference for all technology fingerprints implemented in the Universal Technology Stack Detection Engine. Every fingerprint is validated deterministically against public, observable evidence.

---

## Summary by Category

| Category | Total Technologies | Description |
| :--- | :--- | :--- |
| **ADVERTISING** | `4` | Advertising conversion pixels and retargeting scripts |
| **ANALYTICS** | `8` | Web analytics, tag managers, and product intelligence services |
| **BACKEND** | `23` | Backend web frameworks, runtimes, and HTTP web servers |
| **CMS** | `45` | Content Management Systems, Website Builders, Headless CMS, and Page Builders |
| **DATABASE** | `8` | Observable databases, vector search, and managed search indexes |
| **FONTS** | `2` | Web font delivery networks and type providers |
| **FRONTEND** | `28` | Frontend frameworks, UI component libraries, and client JavaScript utilities |
| **HOSTING** | `16` | Cloud hosting platforms, CDN edge networks, and serverless environments |
| **LANGUAGE** | `17` | Client-side and verified server-side programming languages |
| **MARKETING** | `4` | Marketing automation, newsletter forms, and CRM embeds |
| **PAYMENTS** | `5` | Client payment SDKs and checkout elements |
| **SEARCH** | `4` | Client-side and third-party site search engines |
| **SECURITY** | `3` | Bot protection, CAPTCHAs, and web application firewalls |
| **UX** | `6` | Heatmaps, session replays, customer messaging, and support widgets |

---

## Category: ADVERTISING (4 Technologies)

### Google Ads Conversion Tracking (`google_ads`)
- **Subcategory:** `conversion_tracking`
- **Vendor / Type:** Google Inc.
- **Official Website:** [https://ads.google.com](https://ads.google.com)
- **Description:** Conversion measurement and remarketing tag for Google Ads.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['googleadservices\\.com/pagead/conversion\\.js', 'googleads\\.g\\.doubleclick\\.net']`; Inline JS Markers: `["gtag('event', 'conversion'"]`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### LinkedIn Insight Tag (`linkedin_insight`)
- **Subcategory:** `conversion_pixel`
- **Vendor / Type:** LinkedIn Corporation
- **Official Website:** [https://business.linkedin.com/marketing-solutions/insight-tag](https://business.linkedin.com/marketing-solutions/insight-tag)
- **Description:** Lightweight JavaScript tag for in-depth campaign reporting and website demographic insights.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['snap\\.licdn\\.com/li\\.lms-analytics/insight\\.min\\.js']`; Inline JS Markers: `['_linkedin_partner_id']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Meta Pixel (`meta_pixel`)
- **Subcategory:** `conversion_pixel`
- **Vendor / Type:** Meta Platforms Inc.
- **Official Website:** [https://www.facebook.com/business/tools/meta-pixel](https://www.facebook.com/business/tools/meta-pixel)
- **Description:** Conversion measurement and remarketing pixel for Meta ads.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['connect\\.facebook\\.net/[^/]+/fbevents\\.js']`; Inline JS Markers: `["fbq('init'", "fbq('track'"]`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### TikTok Pixel (`tiktok_pixel`)
- **Subcategory:** `conversion_pixel`
- **Vendor / Type:** ByteDance Ltd.
- **Official Website:** [https://ads.tiktok.com](https://ads.tiktok.com)
- **Description:** Conversion measurement and audience optimization pixel for TikTok advertising.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['analytics\\.tiktok\\.com/i18n/pixel/events\\.js']`; Inline JS Markers: `['ttq.load(', 'ttq.page(']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

---

## Category: ANALYTICS (8 Technologies)

### Adobe Analytics (`adobe_analytics`)
- **Subcategory:** `enterprise_analytics`
- **Vendor / Type:** Adobe Systems
- **Official Website:** [https://business.adobe.com/products/analytics/adobe-analytics.html](https://business.adobe.com/products/analytics/adobe-analytics.html)
- **Description:** Enterprise web analytics providing actionable insights from customer data.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['assets\\.adobedtm\\.com', 'omtrdc\\.net', 's_code\\.js']`; Inline JS Markers: `['s_account', 's.t()']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Amplitude (`amplitude`)
- **Subcategory:** `product_analytics`
- **Vendor / Type:** Amplitude Inc.
- **Official Website:** [https://amplitude.com](https://amplitude.com)
- **Description:** Digital analytics platform tracking product engagement and retention.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['cdn\\.amplitude\\.com/libs/amplitude-']`; Inline JS Markers: `['amplitude.getInstance(', 'amplitude.init(']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Fathom Analytics (`fathom`)
- **Subcategory:** `privacy_analytics`
- **Vendor / Type:** Conva Ventures Inc.
- **Official Website:** [https://usefathom.com](https://usefathom.com)
- **Description:** Simple, privacy-first alternative to Google Analytics.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['cdn\\.usefathom\\.com/script\\.js']`; Inline JS Markers: `['fathom.trackPageview']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Google Analytics (`google_analytics`)
- **Subcategory:** `analytics`
- **Vendor / Type:** Google Inc.
- **Official Website:** [https://analytics.google.com](https://analytics.google.com)
- **Description:** Web analytics service tracking website traffic and user engagement.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Cookies: `['_ga', '_gid']`; Script URLs: `['google-analytics\\.com/(analytics|ga)\\.js', 'googletagmanager\\.com/gtag/js\\?id=(G|UA)-']`; Inline JS Markers: `["ga('create'", "gtag('config'"]`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Google Tag Manager (`google_tag_manager`)
- **Subcategory:** `tag_management`
- **Vendor / Type:** Google Inc.
- **Official Website:** [https://tagmanager.google.com](https://tagmanager.google.com)
- **Description:** Tag management system to manage measurement and marketing tags.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['googletagmanager\\.com/gtm\\.js\\?id=']`; DOM Markers: `['id:gtm-script']`; Inline JS Markers: `['dataLayer.push', 'gtm.start']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Matomo (`matomo`)
- **Subcategory:** `privacy_analytics`
- **Vendor / Type:** InnoCraft
- **Official Website:** [https://matomo.org](https://matomo.org)
- **Description:** Privacy-friendly open-source web analytics platform giving 100% data ownership.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['/matomo\\.js', '/piwik\\.js']`; Inline JS Markers: `['_paq.push']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Mixpanel (`mixpanel`)
- **Subcategory:** `product_analytics`
- **Vendor / Type:** Mixpanel Inc.
- **Official Website:** [https://mixpanel.com](https://mixpanel.com)
- **Description:** Product analytics software to track user interactions and conversion funnels.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['cdn\\.mxpnl\\.com/libs/mixpanel-']`; Inline JS Markers: `['mixpanel.init(', 'mixpanel.track(']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Plausible Analytics (`plausible`)
- **Subcategory:** `privacy_analytics`
- **Vendor / Type:** Plausible Insights
- **Official Website:** [https://plausible.io](https://plausible.io)
- **Description:** Lightweight and open-source privacy-focused web analytics.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['plausible\\.io/js/script\\.js', '/js/plausible\\.js']`; Inline JS Markers: `['window.plausible']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

---

## Category: BACKEND (23 Technologies)

### ASP.NET (`asp_net`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** Microsoft
- **Official Website:** [https://dotnet.microsoft.com/apps/aspnet](https://dotnet.microsoft.com/apps/aspnet)
- **Description:** Open-source web framework for building modern web apps with .NET.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `csharp`, `dotnet`
- **Detection Vectors:** Headers: `{'x-powered-by': 'ASP\\.NET', 'x-aspnet-version': '.*'}`; Cookies: `['ASP.NET_SessionId', '.ASPXAUTH']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### ASP.NET Core (`asp_net_core`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** Microsoft
- **Official Website:** [https://dotnet.microsoft.com/apps/aspnet](https://dotnet.microsoft.com/apps/aspnet)
- **Description:** Cross-platform, high-performance, open-source framework for building modern web apps.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `csharp`, `dotnet`
- **Detection Vectors:** Headers: `{'x-powered-by': 'ASP\\.NET Core'}`; Cookies: `['.AspNetCore.']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Apache HTTP Server (`apache`)
- **Subcategory:** `web_server`
- **Vendor / Type:** Apache Software Foundation
- **Official Website:** [https://httpd.apache.org](https://httpd.apache.org)
- **Description:** Robust, commercial-grade open-source HTTP server.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': '^Apache(/([0-9\\.]+))?'}`
- **Version Extraction Rules:** header -> regex `Apache/([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Blazor (`blazor`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** Microsoft
- **Official Website:** [https://dotnet.microsoft.com/apps/aspnet/web-apps/blazor](https://dotnet.microsoft.com/apps/aspnet/web-apps/blazor)
- **Description:** Framework for building interactive client-side web UI with .NET and C#.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `csharp`, `dotnet`
- **Detection Vectors:** Script URLs: `['_framework/blazor\\.(webassembly|server)\\.js']`; DOM Markers: `['_blazor', 'id:components-reconnect-modal']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Caddy (`caddy`)
- **Subcategory:** `web_server`
- **Vendor / Type:** Caddy Authors
- **Official Website:** [https://caddyserver.com](https://caddyserver.com)
- **Description:** Enterprise-ready open source web server with automatic HTTPS written in Go.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `go`
- **Detection Vectors:** Headers: `{'server': '^Caddy'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### CodeIgniter (`codeigniter`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** CodeIgniter Foundation
- **Official Website:** [https://codeigniter.com](https://codeigniter.com)
- **Description:** Powerful PHP framework with a very small footprint.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `php`
- **Detection Vectors:** Headers: `{'set-cookie': 'ci_session='}`; Cookies: `['ci_session']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Django (`django`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** Django Software Foundation
- **Official Website:** [https://www.djangoproject.com](https://www.djangoproject.com)
- **Description:** High-level Python web framework encouraging rapid development.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `python`
- **Detection Vectors:** Headers: `{'set-cookie': 'csrftoken='}`; Cookies: `['csrftoken', 'sessionid']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Express.js (`express`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** OpenJS Foundation
- **Official Website:** [https://expressjs.com](https://expressjs.com)
- **Description:** Fast, unopinionated, minimalist web framework for Node.js.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `nodejs`
- **Detection Vectors:** Headers: `{'x-powered-by': 'Express'}`; Cookies: `['connect.sid']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### FastAPI (`fastapi`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** Tiangolo / Sebastián Ramírez
- **Official Website:** [https://fastapi.tiangolo.com](https://fastapi.tiangolo.com)
- **Description:** High performance, easy to learn, fast to code, production-ready Python API framework.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `python`
- **Detection Vectors:** Headers: `{'server': 'uvicorn'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Fastify (`fastify`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** OpenJS Foundation
- **Official Website:** [https://fastify.dev](https://fastify.dev)
- **Description:** Fast and low overhead web framework for Node.js.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `nodejs`
- **Detection Vectors:** Headers: `{'x-powered-by': 'Fastify'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Fiber (`fiber`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** GoFiber
- **Official Website:** [https://gofiber.io](https://gofiber.io)
- **Description:** Express-inspired web framework written in Go built on top of Fasthttp.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `go`
- **Detection Vectors:** Headers: `{'server': '^Fiber'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Flask (`flask`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** Pallets
- **Official Website:** [https://flask.palletsprojects.com](https://flask.palletsprojects.com)
- **Description:** Lightweight WSGI web application framework in Python.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `python`
- **Detection Vectors:** Headers: `{'server': 'Werkzeug'}`; Cookies: `['session']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Gin (`gin`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** Gin Authors
- **Official Website:** [https://gin-gonic.com](https://gin-gonic.com)
- **Description:** HTTP web framework written in Go (Golang) featuring high performance.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `go`
- **Detection Vectors:** Headers: `{'server': '\\bgin-gonic\\b|^gin(/[\\d\\.]+)?'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Laravel (`laravel`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** Taylor Otwell
- **Official Website:** [https://laravel.com](https://laravel.com)
- **Description:** PHP web framework with expressive, elegant syntax.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `php`
- **Detection Vectors:** Headers: `{'set-cookie': 'laravel_session='}`; Cookies: `['laravel_session', 'XSRF-TOKEN']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### LiteSpeed (`litespeed`)
- **Subcategory:** `web_server`
- **Vendor / Type:** LiteSpeed Technologies
- **Official Website:** [https://www.litespeedtech.com](https://www.litespeedtech.com)
- **Description:** High-performance, high-scalability LiteSpeed Web Server.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': 'LiteSpeed'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Microsoft IIS (`iis`)
- **Subcategory:** `web_server`
- **Vendor / Type:** Microsoft
- **Official Website:** [https://www.iis.net](https://www.iis.net)
- **Description:** Flexible, secure and manageable Web server for hosting anything on the Web.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': 'Microsoft-IIS(/([0-9\\.]+))?'}`
- **Version Extraction Rules:** header -> regex `Microsoft-IIS/([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### NestJS (`nestjs`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** NestJS
- **Official Website:** [https://nestjs.com](https://nestjs.com)
- **Description:** Progressive Node.js framework for building efficient and scalable server-side applications.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `nodejs`, `typescript`
- **Detection Vectors:** Headers: `{'x-powered-by': 'Nest(JS)?'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Nginx (`nginx`)
- **Subcategory:** `web_server`
- **Vendor / Type:** F5 Inc.
- **Official Website:** [https://nginx.org](https://nginx.org)
- **Description:** High-performance HTTP server, reverse proxy, and mail proxy.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': '^nginx(/([0-9\\.]+))?'}`
- **Version Extraction Rules:** header -> regex `nginx/([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Node.js (`nodejs`)
- **Subcategory:** `runtime`
- **Vendor / Type:** OpenJS Foundation
- **Official Website:** [https://nodejs.org](https://nodejs.org)
- **Description:** Asynchronous event-driven JavaScript backend runtime.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-powered-by': 'Node\\.js|Express'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Presence of frontend JavaScript does NOT prove backend Node.js.

### Phoenix (`phoenix`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** Phoenix Framework
- **Official Website:** [https://www.phoenixframework.org](https://www.phoenixframework.org)
- **Description:** Productive web framework that builds rich, interactive web applications in Elixir.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `elixir`
- **Detection Vectors:** Headers: `{'x-request-id': '.*'}`; Cookies: `['_.*_key']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Ruby on Rails (`ruby_on_rails`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** David Heinemeier Hansson
- **Official Website:** [https://rubyonrails.org](https://rubyonrails.org)
- **Description:** Server-side web application framework written in Ruby.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `ruby`
- **Detection Vectors:** Headers: `{'x-powered-by': 'Phusion Passenger|Rails', 'x-runtime': '[0-9\\.]+'}`; Cookies: `['_session_id']`; DOM Markers: `['meta[name=csrf-param]']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Spring Boot (`spring_boot`)
- **Subcategory:** `enterprise_framework`
- **Vendor / Type:** VMware / Broadcom
- **Official Website:** [https://spring.io/projects/spring-boot](https://spring.io/projects/spring-boot)
- **Description:** Enterprise Java web application framework.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `java`
- **Detection Vectors:** Headers: `{'x-application-context': '.*'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Symfony (`symfony`)
- **Subcategory:** `web_framework`
- **Vendor / Type:** SensioLabs
- **Official Website:** [https://symfony.com](https://symfony.com)
- **Description:** High-performance PHP framework for Web development.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `php`
- **Detection Vectors:** Headers: `{'x-powered-by': 'Symfony'}`; Cookies: `['symfony', '_sf2_attributes']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

---

## Category: CMS (45 Technologies)

### BigCommerce (`bigcommerce`)
- **Subcategory:** `ecommerce`
- **Vendor / Type:** BigCommerce Pty. Ltd.
- **Official Website:** [https://www.bigcommerce.com](https://www.bigcommerce.com)
- **Description:** SaaS e-commerce platform for fast-growing and enterprise businesses.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `ecommerce`
- **Detection Vectors:** Headers: `{'x-bc-store-id': '.*', 'x-bc-theme': '.*'}`; Script URLs: `['cdn\\d+\\.bigcommerce\\.com', 'storefront\\.bigcommerce\\.com']`; Stylesheets: `['cdn\\d+\\.bigcommerce\\.com']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Bubble (`bubble`)
- **Subcategory:** `no_code_platform`
- **Vendor / Type:** Bubble Group Inc.
- **Official Website:** [https://bubble.io](https://bubble.io)
- **Description:** No-code visual web application development platform.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['d1muf25xaso8hp\\.cloudfront\\.net', 'app\\.bubble\\.io']`; Inline JS Markers: `['window.bubble_debug', 'bubble_version']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Carrd (`carrd`)
- **Subcategory:** `website_builder`
- **Vendor / Type:** Carrd Inc.
- **Official Website:** [https://carrd.co](https://carrd.co)
- **Description:** Simple, fully responsive one-page site builder.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Meta Generator regex: `['Carrd']`; Script URLs: `['carrd(\\.min)?\\.js']`; Stylesheets: `['assets/main\\.css']`; DOM Markers: `['id:wrapper', 'class:is-carrd']`; HTML Comments: `['<!-- Carrd site -->']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Contact Form 7 (`contact_form_7`)
- **Subcategory:** `form_plugin`
- **Vendor / Type:** Rock Lobster LLC
- **Official Website:** [https://contactform7.com](https://contactform7.com)
- **Description:** Form management plugin for WordPress.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `wordpress`, `php`
- **Detection Vectors:** Script URLs: `['/wp-content/plugins/contact-form-7/']`; Stylesheets: `['/wp-content/plugins/contact-form-7/']`; DOM Markers: `['class:wpcf7-form']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Contentful (`contentful`)
- **Subcategory:** `headless_cms`
- **Vendor / Type:** Contentful GmbH
- **Official Website:** [https://www.contentful.com](https://www.contentful.com)
- **Description:** Composable content platform for enterprise digital products.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['ctfassets\\.net']`; Asset URLs: `['images\\.ctfassets\\.net', 'downloads\\.ctfassets\\.net', 'assets\\.ctfassets\\.net']` (Min: 2)
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Headless backend; detected only when public assets are served via Contentful CDN.

### Craft CMS (`craft_cms`)
- **Subcategory:** `cms`
- **Vendor / Type:** Pixel & Tonic Inc.
- **Official Website:** [https://craftcms.com](https://craftcms.com)
- **Description:** Flexible, user-friendly CMS for creating custom digital experiences.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `php`
- **Detection Vectors:** Headers: `{'x-powered-by': 'Craft\\s*CMS'}`; Cookies: `['CRAFT_CSRF_TOKEN']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### DatoCMS (`datocms`)
- **Subcategory:** `headless_cms`
- **Vendor / Type:** DatoCMS
- **Official Website:** [https://www.datocms.com](https://www.datocms.com)
- **Description:** API-based headless content management system.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['datocms-assets\\.com']`; Asset URLs: `['datocms-assets\\.com']` (Min: 2)
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Directus (`directus`)
- **Subcategory:** `headless_cms`
- **Vendor / Type:** Monospace Inc.
- **Official Website:** [https://directus.io](https://directus.io)
- **Description:** Open-source data platform and headless CMS.
- **Confidence Weight:** `0.8`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `nodejs`
- **Detection Vectors:** Headers: `{'x-powered-by': 'Directus'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Divi (`divi`)
- **Subcategory:** `page_builder`
- **Vendor / Type:** Elegant Themes
- **Official Website:** [https://www.elegantthemes.com/gallery/divi/](https://www.elegantthemes.com/gallery/divi/)
- **Description:** Visual website builder theme and plugin for WordPress.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `wordpress`, `php`
- **Detection Vectors:** Script URLs: `['/divi/js/', 'et-builder']`; Stylesheets: `['/themes/divi/style\\.css']`; Body Classes: `['et_divi_builder', 'et_pb_pagebuilder_layout']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Drupal (`drupal`)
- **Subcategory:** `cms`
- **Vendor / Type:** Open Source
- **Official Website:** [https://www.drupal.org](https://www.drupal.org)
- **Description:** Modular open-source content management framework.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `php`
- **Detection Vectors:** Meta Generator regex: `['Drupal\\s*([0-9\\.]+)?']`; Headers: `{'x-drupal-cache': '.*', 'x-generator': 'Drupal\\s*([0-9\\.]+)?'}`; Script URLs: `['/sites/default/files/', '/core/misc/drupal\\.js']`; Stylesheets: `['/sites/default/files/', '/core/themes/']`; DOM Markers: `['class:drupal-tabs', 'class:block-drupal']`; Inline JS Markers: `['drupalSettings', 'Drupal.behaviors']`
- **Version Extraction Rules:** meta_generator -> regex `Drupal\s*([0-9\.]+)` (explicit_version), header -> regex `Drupal\s*([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Duda (`duda`)
- **Subcategory:** `website_builder`
- **Vendor / Type:** Duda Inc.
- **Official Website:** [https://www.duda.co](https://www.duda.co)
- **Description:** Responsive website builder platform designed for digital agencies.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Meta Generator regex: `['Duda']`; Script URLs: `['static\\.duda\\.co', 'irp\\.cdn-website\\.com']`; Stylesheets: `['static\\.duda\\.co', 'irp\\.cdn-website\\.com']`; DOM Markers: `['id:dmRoot']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Elementor (`elementor`)
- **Subcategory:** `page_builder`
- **Vendor / Type:** Elementor Ltd.
- **Official Website:** [https://elementor.com](https://elementor.com)
- **Description:** Visual drag-and-drop website builder plugin for WordPress.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `wordpress`, `php`
- **Detection Vectors:** Meta Generator regex: `['Elementor\\s*([0-9\\.]+)?']`; Script URLs: `['/wp-content/plugins/elementor/']`; Stylesheets: `['/wp-content/plugins/elementor/']`; DOM Markers: `['class:elementor-section']`; Body Classes: `['elementor-default', 'elementor-page']`
- **Version Extraction Rules:** meta_generator -> regex `Elementor\s*([0-9\.]+)` (explicit_version), stylesheet_url -> regex `/elementor/assets/.*?ver=([0-9\.]+)` (asset_hint_unverified)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Elementor Pro (`elementor_pro`)
- **Subcategory:** `page_builder`
- **Vendor / Type:** Elementor Ltd.
- **Official Website:** [https://elementor.com/pro/](https://elementor.com/pro/)
- **Description:** Premium extension for Elementor page builder.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `elementor`, `wordpress`, `php`
- **Detection Vectors:** Script URLs: `['/wp-content/plugins/elementor-pro/']`; Stylesheets: `['/wp-content/plugins/elementor-pro/']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Framer (`framer`)
- **Subcategory:** `website_builder`
- **Vendor / Type:** Framer B.V.
- **Official Website:** [https://www.framer.com](https://www.framer.com)
- **Description:** Interactive website builder and CMS platform for designers and teams.
- **Confidence Weight:** `0.99`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Meta Generator regex: `['Framer\\s*([a-zA-Z0-9\\.\\-]+)?']`; Headers: `{'server': 'Framer/([a-zA-Z0-9]+)', 'x-generator': 'Framer'}`; Script URLs: `['events\\.framer\\.com', 'framerusercontent\\.com', 'framerstatic\\.com']`; Stylesheets: `['framercdn\\.com', 'framerstatic\\.com']`; DOM Markers: `['data-framer-name', 'data-framer-hydrate-v2', 'data-framer-component', 'id:__framer-badge-container']`; Inline JS Markers: `['__framer__', 'framer.site', 'data-framer-hydrate-v2']`; Asset URLs: `['framerusercontent\\.com', 'framerstatic\\.com', 'framercdn\\.com']` (Min: 2)
- **Version Extraction Rules:** meta_generator -> regex `Framer\s*([a-zA-Z0-9\.\-]+)` (explicit_version), header -> regex `Framer/([a-zA-Z0-9\.\-]+)` (explicit_version)
- **Known False-Positive Guards:** A non-Framer site embedding a single external Framer image.
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Ghost (`ghost`)
- **Subcategory:** `cms`
- **Vendor / Type:** Ghost Foundation
- **Official Website:** [https://ghost.org](https://ghost.org)
- **Description:** Modern open-source publishing platform built on Node.js.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `nodejs`
- **Detection Vectors:** Meta Generator regex: `['Ghost\\s*([0-9\\.]+)?']`; Headers: `{'x-ghost-cache-status': '.*'}`; Script URLs: `['ghost-search\\.min\\.js']`; Stylesheets: `['/assets/built/screen\\.css']`; DOM Markers: `['class:ghost-portal-root']`
- **Version Extraction Rules:** meta_generator -> regex `Ghost\s*([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Gutenberg (`gutenberg`)
- **Subcategory:** `page_builder`
- **Vendor / Type:** WordPress Community
- **Official Website:** [https://wordpress.org/gutenberg/](https://wordpress.org/gutenberg/)
- **Description:** The native block editor for WordPress.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `wordpress`, `php`
- **Detection Vectors:** Stylesheets: `['/wp-includes/css/dist/block-library/style\\.min\\.css', 'block-library']`; DOM Markers: `['class:wp-block-group', 'class:wp-block-columns']`; Body Classes: `['wp-embed-responsive']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### HubSpot CMS (`hubspot_cms`)
- **Subcategory:** `cms`
- **Vendor / Type:** HubSpot Inc.
- **Official Website:** [https://www.hubspot.com/products/cms](https://www.hubspot.com/products/cms)
- **Description:** Cloud CMS connected with HubSpot CRM and marketing automation.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Meta Generator regex: `['HubSpot']`; Script URLs: `['js\\.hs-scripts\\.com', 'static\\.hsappstatic\\.net']`; Stylesheets: `['static\\.hsappstatic\\.net']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Hygraph (`hygraph`)
- **Subcategory:** `headless_cms`
- **Vendor / Type:** Hygraph GmbH
- **Official Website:** [https://hygraph.com](https://hygraph.com)
- **Description:** Federated content platform formerly known as GraphCMS.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['media\\.graphassets\\.com']`; Asset URLs: `['media\\.graphassets\\.com']` (Min: 2)
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Joomla (`joomla`)
- **Subcategory:** `cms`
- **Vendor / Type:** Open Source
- **Official Website:** [https://www.joomla.org](https://www.joomla.org)
- **Description:** Open-source CMS for publishing web content.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `php`
- **Detection Vectors:** Meta Generator regex: `['Joomla!\\s*-\\s*Open Source Content Management']`; Headers: `{'x-content-encoded-by': 'Joomla'}`; Script URLs: `['/media/jui/js/', '/media/system/js/core\\.js']`; Stylesheets: `['/templates/system/css/', '/media/jui/css/']`; Inline JS Markers: `['Joomla.JText', 'joomla.javascript']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Kentico (`kentico`)
- **Subcategory:** `enterprise_cms`
- **Vendor / Type:** Kentico Software
- **Official Website:** [https://www.kentico.com](https://www.kentico.com)
- **Description:** Web content management system and digital experience platform.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `dotnet`
- **Detection Vectors:** Meta Generator regex: `['Kentico\\s*CMS\\s*([0-9\\.]+)?']`; Cookies: `['CMSPreferredCulture', 'CMSCurrentTheme']`; Script URLs: `['/CMSPages/', '/CMSModules/']`
- **Version Extraction Rules:** meta_generator -> regex `Kentico\s*CMS\s*([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Magento / Adobe Commerce (`magento`)
- **Subcategory:** `ecommerce`
- **Vendor / Type:** Adobe Inc.
- **Official Website:** [https://business.adobe.com/products/magento/magento-commerce.html](https://business.adobe.com/products/magento/magento-commerce.html)
- **Description:** Enterprise e-commerce platform.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `php`, `ecommerce`
- **Detection Vectors:** Cookies: `['frontend_cid', 'form_key']`; Script URLs: `['/static/version[0-9]+/frontend/', 'mage/cookies\\.js']`; Stylesheets: `['/static/version[0-9]+/frontend/']`; Inline JS Markers: `['Mage.Cookies', "require(['mage/apply/main']"]`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### October CMS (`october_cms`)
- **Subcategory:** `cms`
- **Vendor / Type:** October CMS
- **Official Website:** [https://octobercms.com](https://octobercms.com)
- **Description:** Self-hosted content management platform based on the Laravel PHP Framework.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `laravel`, `php`
- **Detection Vectors:** Meta Generator regex: `['October\\s*CMS']`; Cookies: `['october_session']`; Script URLs: `['/modules/system/assets/js/framework\\.js']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### OpenCart (`opencart`)
- **Subcategory:** `ecommerce`
- **Vendor / Type:** OpenCart
- **Official Website:** [https://www.opencart.com](https://www.opencart.com)
- **Description:** Open-source online store management system.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `php`, `ecommerce`
- **Detection Vectors:** Cookies: `['OCSESSID']`; Script URLs: `['catalog/view/javascript/common\\.js']`; Stylesheets: `['catalog/view/theme/default/stylesheet/stylesheet\\.css']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Payload CMS (`payload_cms`)
- **Subcategory:** `headless_cms`
- **Vendor / Type:** Payload
- **Official Website:** [https://payloadcms.com](https://payloadcms.com)
- **Description:** Code-first, TypeScript-based headless CMS built on Next.js.
- **Confidence Weight:** `0.8`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `nodejs`
- **Detection Vectors:** Headers: `{'x-payload-cms': '.*', 'x-payload-version': '.*'}`; Script URLs: `['payload-client']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### PrestaShop (`prestashop`)
- **Subcategory:** `ecommerce`
- **Vendor / Type:** PrestaShop SA
- **Official Website:** [https://prestashop.com](https://prestashop.com)
- **Description:** Open source e-commerce solution.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `php`, `ecommerce`
- **Detection Vectors:** Meta Generator regex: `['PrestaShop']`; Script URLs: `['/themes/[^/]+/assets/js/theme\\.js', '/modules/ps_']`; Inline JS Markers: `['prestashop.customer', 'prestashop.cart']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Prismic (`prismic`)
- **Subcategory:** `headless_cms`
- **Vendor / Type:** Prismic
- **Official Website:** [https://prismic.io](https://prismic.io)
- **Description:** Headless CMS with visual slice building for developers and marketers.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['static\\.cdn\\.prismic\\.io/prismic\\.js', 'images\\.prismic\\.io']`; Asset URLs: `['images\\.prismic\\.io', 'prismic-io\\.s3\\.amazonaws\\.com']` (Min: 2)
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Rank Math SEO (`rank_math`)
- **Subcategory:** `seo_plugin`
- **Vendor / Type:** Rank Math
- **Official Website:** [https://rankmath.com](https://rankmath.com)
- **Description:** Search engine optimization plugin suite for WordPress.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `wordpress`, `php`
- **Detection Vectors:** Script URLs: `['/wp-content/plugins/seo-by-rank-math/']`; HTML Comments: `['SEO by Rank Math', '<!-- / SEO by Rank Math']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Salesforce Commerce Cloud (`salesforce_commerce_cloud`)
- **Subcategory:** `ecommerce`
- **Vendor / Type:** Salesforce Inc.
- **Official Website:** [https://www.salesforce.com/commerce/](https://www.salesforce.com/commerce/)
- **Description:** Enterprise cloud commerce platform formerly known as Demandware.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `ecommerce`
- **Detection Vectors:** Cookies: `['dwsid', 'dwsecuretoken']`; Script URLs: `['/on/demandware\\.store/', '/on/demandware\\.static/']`; Stylesheets: `['/on/demandware\\.static/']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Sanity (`sanity`)
- **Subcategory:** `headless_cms`
- **Vendor / Type:** Sanity.io
- **Official Website:** [https://www.sanity.io](https://www.sanity.io)
- **Description:** Platform for structured content and real-time collaboration.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['@sanity/client', 'cdn\\.sanity\\.io']`; Asset URLs: `['cdn\\.sanity\\.io']` (Min: 2)
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Headless backend; detected only when public assets or client SDK are observable.

### Shopify (`shopify`)
- **Subcategory:** `ecommerce`
- **Vendor / Type:** Shopify Inc.
- **Official Website:** [https://www.shopify.com](https://www.shopify.com)
- **Description:** Hosted multi-channel e-commerce and checkout platform.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `ecommerce`
- **Detection Vectors:** Meta Generator regex: `['Shopify']`; Headers: `{'x-shopify-stage': '.*', 'x-shopid': '.*'}`; Cookies: `['_shopify_y', '_shopify_s', '_shopify_sa_p']`; Script URLs: `['cdn\\.shopify\\.com', 'shopify-cloud']`; Stylesheets: `['cdn\\.shopify\\.com']`; DOM Markers: `['id:shopify-section', 'class:shopify-payment-button']`; Inline JS Markers: `['Shopify.theme', 'window.Shopify', 'ShopifyBuy']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Sitecore (`sitecore`)
- **Subcategory:** `enterprise_cms`
- **Vendor / Type:** Sitecore
- **Official Website:** [https://www.sitecore.com](https://www.sitecore.com)
- **Description:** Enterprise digital experience platform and CMS.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Cookies: `['SC_ANALYTICS_GLOBAL_COOKIE']`; Script URLs: `['/sitecore/']`; Stylesheets: `['/sitecore/']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Squarespace (`squarespace`)
- **Subcategory:** `website_builder`
- **Vendor / Type:** Squarespace Inc.
- **Official Website:** [https://www.squarespace.com](https://www.squarespace.com)
- **Description:** Hosted all-in-one website building and e-commerce platform.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-served-by': 'Squarespace'}`; Cookies: `['SS_MID', 'SS_MATTR']`; Script URLs: `['static1\\.squarespace\\.com', 'assets\\.squarespace\\.com']`; Stylesheets: `['static1\\.squarespace\\.com']`; DOM Markers: `['id:siteWrapper', 'body[class*=squarespace]']`; Inline JS Markers: `['Static.SQUARESPACE_CONTEXT', 'SQUARESPACE_CACHE_CONTEXT']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Storyblok (`storyblok`)
- **Subcategory:** `headless_cms`
- **Vendor / Type:** Storyblok GmbH
- **Official Website:** [https://www.storyblok.com](https://www.storyblok.com)
- **Description:** Pioneer headless CMS with visual editor.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['storyblok-js-client', 'app\\.storyblok\\.com', 'a\\.storyblok\\.com']`; Asset URLs: `['a\\.storyblok\\.com']` (Min: 2)
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Strapi (`strapi`)
- **Subcategory:** `headless_cms`
- **Vendor / Type:** Strapi SAS
- **Official Website:** [https://strapi.io](https://strapi.io)
- **Description:** Open-source Node.js Headless CMS.
- **Confidence Weight:** `0.8`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `nodejs`
- **Detection Vectors:** Headers: `{'x-powered-by': 'Strapi'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### TYPO3 (`typo3`)
- **Subcategory:** `cms`
- **Vendor / Type:** TYPO3 Association
- **Official Website:** [https://typo3.org](https://typo3.org)
- **Description:** Open source enterprise content management system.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `php`
- **Detection Vectors:** Meta Generator regex: `['TYPO3\\s*(CMS)?']`; Script URLs: `['typo3temp/', 'typo3conf/']`; Stylesheets: `['typo3temp/']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Tilda (`tilda`)
- **Subcategory:** `website_builder`
- **Vendor / Type:** Tilda Publishing
- **Official Website:** [https://tilda.cc](https://tilda.cc)
- **Description:** Block-based visual website builder.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['static\\.tildacdn\\.com']`; Stylesheets: `['static\\.tildacdn\\.com']`; DOM Markers: `['id:allrecords', 'class:t-records']`; Inline JS Markers: `['t_records__init', 'window.tildaMembersId']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Umbraco (`umbraco`)
- **Subcategory:** `cms`
- **Vendor / Type:** Umbraco HQ
- **Official Website:** [https://umbraco.com](https://umbraco.com)
- **Description:** Flexible open-source .NET CMS platform.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `dotnet`
- **Detection Vectors:** Headers: `{'x-umbraco-version': '([0-9\\.]+)'}`; Cookies: `['UMB_UCONTEXT', 'UMB-XSRF-TOKEN']`
- **Version Extraction Rules:** header -> regex `x-umbraco-version.*?([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### WPBakery (`wpbakery`)
- **Subcategory:** `page_builder`
- **Vendor / Type:** WPBakery
- **Official Website:** [https://wpbakery.com](https://wpbakery.com)
- **Description:** Visual Composer drag-and-drop page builder for WordPress.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `wordpress`, `php`
- **Detection Vectors:** Script URLs: `['/plugins/js_composer/']`; Stylesheets: `['/plugins/js_composer/']`; DOM Markers: `['class:vc_row', 'class:wpb_wrapper']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Webflow (`webflow`)
- **Subcategory:** `website_builder`
- **Vendor / Type:** Webflow Inc.
- **Official Website:** [https://webflow.com](https://webflow.com)
- **Description:** Visual web design and CMS hosting platform.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Meta Generator regex: `['Webflow']`; Script URLs: `['assets\\.website-files\\.com', 'd3e54v103j8qbb\\.cloudfront\\.net']`; Stylesheets: `['assets\\.website-files\\.com', 'assets-global\\.website-files\\.com']`; DOM Markers: `['html[data-wf-page]', 'html[data-wf-site]', 'webflow:data-wf']`; Inline JS Markers: `['Webflow.require', 'Webflow.push']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Weebly (`weebly`)
- **Subcategory:** `website_builder`
- **Vendor / Type:** Square Inc.
- **Official Website:** [https://www.weebly.com](https://www.weebly.com)
- **Description:** E-commerce and visual website builder platform.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Meta Generator regex: `['Weebly']`; Script URLs: `['cdn2\\.editmysite\\.com']`; Stylesheets: `['cdn2\\.editmysite\\.com']`; DOM Markers: `['body[class*=weebly]']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Wix (`wix`)
- **Subcategory:** `website_builder`
- **Vendor / Type:** Wix.com Ltd.
- **Official Website:** [https://www.wix.com](https://www.wix.com)
- **Description:** Cloud-based website builder and hosting service.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Meta Generator regex: `['Wix\\.com Website Builder']`; Headers: `{'x-wix-request-id': '.*', 'x-wix-renderer-server': '.*'}`; Script URLs: `['static\\.parastorage\\.com', 'static\\.wixstatic\\.com']`; Stylesheets: `['static\\.parastorage\\.com']`; DOM Markers: `['id:SITE_CONTAINER', 'class:wix-site']`; Inline JS Markers: `['wixBiSession', 'wixPerformanceMeasurements', 'wixDeveloperAnalytics']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### WooCommerce (`woocommerce`)
- **Subcategory:** `ecommerce_cms`
- **Vendor / Type:** Automattic Inc.
- **Official Website:** [https://woocommerce.com](https://woocommerce.com)
- **Description:** Open-source customizable ecommerce platform built on WordPress.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `wordpress`, `php`
- **Detection Vectors:** Cookies: `['woocommerce_items_in_cart', 'wp_woocommerce_session_']`; Script URLs: `['/plugins/woocommerce/']`; Stylesheets: `['/plugins/woocommerce/']`; Body Classes: `['woocommerce', 'woocommerce-page']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### WordPress (`wordpress`)
- **Subcategory:** `cms`
- **Vendor / Type:** Automattic / Open Source
- **Official Website:** [https://wordpress.org](https://wordpress.org)
- **Description:** Open-source Content Management System powering web publishing.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `php`
- **Detection Vectors:** Meta Generator regex: `['WordPress\\s*([0-9\\.]+)?']`; Headers: `{'x-generator': 'WordPress', 'x-powered-by': 'WordPress'}`; Cookies: `['wordpress_logged_in_', 'wp-settings-']`; Script URLs: `['/wp-includes/', '/wp-content/']`; Stylesheets: `['/wp-content/', '/wp-includes/']`; DOM Markers: `['class:wp-embed-responsive', 'body[class*=wp-]']`; Inline JS Markers: `['wp.apiFetch', 'wp-json', '_wpnonce']`; HTML Comments: `['<!-- This site is optimized with the Yoast SEO', '<!-- Performance optimized by W3 Total Cache']`
- **Version Extraction Rules:** meta_generator -> regex `WordPress\s*([0-9\.]+)` (explicit_version), script_url -> regex `wp-includes/js/.*?ver=([0-9\.]+)` (asset_hint_unverified)
- **Detection Limitations:** Passive inspection of public assets and generator tags.

### WordPress.com (`wordpress_com`)
- **Subcategory:** `hosted_cms`
- **Vendor / Type:** Automattic
- **Official Website:** [https://wordpress.com](https://wordpress.com)
- **Description:** Managed cloud hosting platform for WordPress.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `wordpress`, `php`
- **Detection Vectors:** Headers: `{'x-hacker': '.*automattic.*', 'x-ac': '.*', 'server': 'wpcom'}`; Script URLs: `['s0\\.wp\\.com', 's1\\.wp\\.com', 's2\\.wp\\.com', 'widgets\\.wp\\.com']`; Stylesheets: `['s0\\.wp\\.com', 's1\\.wp\\.com']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Yoast SEO (`yoast_seo`)
- **Subcategory:** `seo_plugin`
- **Vendor / Type:** Yoast BV
- **Official Website:** [https://yoast.com](https://yoast.com)
- **Description:** Search engine optimization plugin for WordPress.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `wordpress`, `php`
- **Detection Vectors:** Script URLs: `['/wp-content/plugins/wordpress-seo/']`; Stylesheets: `['/wp-content/plugins/wordpress-seo/']`; HTML Comments: `['<!-- This site is optimized with the Yoast SEO plugin']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

---

## Category: DATABASE (8 Technologies)

### Firebase Database / Firestore (`firebase_database`)
- **Subcategory:** `cloud_database`
- **Vendor / Type:** Google Inc.
- **Official Website:** [https://firebase.google.com/products/firestore](https://firebase.google.com/products/firestore)
- **Description:** NoSQL cloud database for storing and syncing data in real time.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['firebase-database', 'firebase-firestore']`; Inline JS Markers: `['firebase.database(', 'firebase.firestore(', 'getFirestore(']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side Firebase SDK observed. Backend database security rules and schema are private.

### MariaDB (`mariadb`)
- **Subcategory:** `relational_database`
- **Vendor / Type:** MariaDB Foundation
- **Official Website:** [https://mariadb.org](https://mariadb.org)
- **Description:** Open source relational database made by the original developers of MySQL.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-database': 'MariaDB'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Private relational database. Detected only when explicitly disclosed.

### MongoDB (`mongodb`)
- **Subcategory:** `document_database`
- **Vendor / Type:** MongoDB Inc.
- **Official Website:** [https://www.mongodb.com](https://www.mongodb.com)
- **Description:** Document-based distributed database designed for modern apps.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-database': 'MongoDB'}`; Script URLs: `['realm\\.mongodb\\.com']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Database servers are private. Detected only via public client SDK or explicit header.

### MySQL (`mysql`)
- **Subcategory:** `relational_database`
- **Vendor / Type:** Oracle Corporation
- **Official Website:** [https://www.mysql.com](https://www.mysql.com)
- **Description:** Open-source relational database management system.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-database': 'MySQL'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Private relational database. Cannot be identified over HTTP unless explicitly disclosed in response headers.

### PostgreSQL (`postgresql`)
- **Subcategory:** `relational_database`
- **Vendor / Type:** PostgreSQL Global Development Group
- **Official Website:** [https://www.postgresql.org](https://www.postgresql.org)
- **Description:** Powerful, open source object-relational database system.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-database': 'PostgreSQL'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Private relational database. Detected only when explicitly disclosed.

### Redis (`redis`)
- **Subcategory:** `in_memory_database`
- **Vendor / Type:** Redis Ltd.
- **Official Website:** [https://redis.io](https://redis.io)
- **Description:** In-memory data store used as a database, cache, streaming engine, and message broker.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-cache-engine': 'Redis', 'x-redis-cache': '.*'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Internal cache/in-memory store. Detected only when disclosed by edge proxy or caching headers.

### SQLite (`sqlite`)
- **Subcategory:** `embedded_database`
- **Vendor / Type:** SQLite Consortium
- **Official Website:** [https://www.sqlite.org](https://www.sqlite.org)
- **Description:** Self-contained, high-reliability, embedded SQL database engine.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-database': 'SQLite'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Embedded server-side database. Detected only when explicitly disclosed.

### Supabase (`supabase`)
- **Subcategory:** `backend_as_a_service`
- **Vendor / Type:** Supabase Inc.
- **Official Website:** [https://supabase.com](https://supabase.com)
- **Description:** Open source Firebase alternative providing Postgres database and client APIs.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['@supabase/supabase-js']`; Inline JS Markers: `['createClient(', 'supabase.co']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Supabase client integration observed. Database tables and schema remain private.

---

## Category: FONTS (2 Technologies)

### Adobe Fonts (`adobe_fonts`)
- **Subcategory:** `web_fonts`
- **Vendor / Type:** Adobe Systems
- **Official Website:** [https://fonts.adobe.com](https://fonts.adobe.com)
- **Description:** Subscription service for high-quality fonts by Typekit.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['use\\.typekit\\.net']`; Stylesheets: `['use\\.typekit\\.net']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Google Fonts (`google_fonts`)
- **Subcategory:** `web_fonts`
- **Vendor / Type:** Google Inc.
- **Official Website:** [https://fonts.google.com](https://fonts.google.com)
- **Description:** Library of open-source and free typography.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Stylesheets: `['fonts\\.googleapis\\.com/css']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

---

## Category: FRONTEND (28 Technologies)

### Alpine.js (`alpinejs`)
- **Subcategory:** `ui_library`
- **Vendor / Type:** Caleb Porzio
- **Official Website:** [https://alpinejs.dev](https://alpinejs.dev)
- **Description:** Rugged, minimal tool for composing JavaScript behavior directly in HTML markup.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['alpine(\\.min)?\\.js']`; DOM Markers: `['x-data', 'x-init', 'x-show', 'x-bind']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Angular (`angular`)
- **Subcategory:** `ui_framework`
- **Vendor / Type:** Google Inc.
- **Official Website:** [https://angular.dev](https://angular.dev)
- **Description:** TypeScript-based web application framework.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['angular(\\.min)?\\.js', 'vendor\\.js.*ng-version']`; DOM Markers: `['ng-version', 'ng-app', 'ng-controller', 'html[ng-app]']`; Inline JS Markers: `['ng.coreTokens', 'window.getAllAngularRootElements']`
- **Version Extraction Rules:** dom_marker -> regex `ng-version[:\s]*([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Ant Design (`ant_design`)
- **Subcategory:** `ui_library`
- **Vendor / Type:** Ant Group
- **Official Website:** [https://ant.design](https://ant.design)
- **Description:** Enterprise-class UI design language and React component library.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `react`
- **Detection Vectors:** Stylesheets: `['antd(\\.min)?\\.css']`; DOM Markers: `['ant-btn', 'ant-layout']`; Body Classes: `['ant-btn', 'ant-layout', 'ant-menu', 'ant-row']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Identifiable via Ant Design CSS or class name prefixes.

### Astro (`astro`)
- **Subcategory:** `framework`
- **Vendor / Type:** Astro Technology Company
- **Official Website:** [https://astro.build](https://astro.build)
- **Description:** The web framework for content-driven websites.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Meta Generator regex: `['Astro(\\s*v[0-9\\.]+)?']`; Script URLs: `['/_astro/']`; Stylesheets: `['/_astro/']`; DOM Markers: `['astro-island']`; Inline JS Markers: `['astro:hydrate']`
- **Version Extraction Rules:** meta_generator -> regex `Astro\s*v?([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Bootstrap (`bootstrap`)
- **Subcategory:** `css_framework`
- **Vendor / Type:** Bootstrap Team
- **Official Website:** [https://getbootstrap.com](https://getbootstrap.com)
- **Description:** Powerful, extensible frontend toolkit for responsive web development.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['bootstrap(\\.bundle)?(\\.min)?\\.js']`; Stylesheets: `['bootstrap(\\.min)?\\.css']`; Body Classes: `['container-fluid', 'row', 'col-md-', 'col-lg-']`
- **Version Extraction Rules:** script_url -> regex `bootstrap/([0-9\.]+)/` (asset_hint_unverified)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Bulma (`bulma`)
- **Subcategory:** `css_framework`
- **Vendor / Type:** Jeremy Thomas
- **Official Website:** [https://bulma.io](https://bulma.io)
- **Description:** Free, open source CSS framework based on Flexbox.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Stylesheets: `['bulma(\\.min)?\\.css']`; Body Classes: `['is-primary', 'navbar-item', 'hero-body']`
- **Version Extraction Rules:** stylesheet_url -> regex `bulma/([0-9\.]+)/` (asset_hint_unverified)
- **Detection Limitations:** Identifiable via Bulma stylesheet link or characteristic class patterns.

### Chakra UI (`chakra_ui`)
- **Subcategory:** `ui_library`
- **Vendor / Type:** Chakra Systems
- **Official Website:** [https://chakra-ui.com](https://chakra-ui.com)
- **Description:** Modular and accessible component library providing building blocks for React apps.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `react`
- **Detection Vectors:** DOM Markers: `['chakra-button', 'chakra-stack']`; Body Classes: `['chakra-button', 'chakra-stack', 'chakra-ui-']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Identifiable via chakra class name conventions.

### D3.js (`d3`)
- **Subcategory:** `data_visualization`
- **Vendor / Type:** Mike Bostock
- **Official Website:** [https://d3js.org](https://d3js.org)
- **Description:** JavaScript library for bespoke data-driven document manipulation and visualization.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['d3(\\.v[0-9]+)?(\\.min)?\\.js', 'd3-selection']`; Inline JS Markers: `['d3.select', 'window.d3']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Observable via D3 script reference or d3 global object.

### Foundation (`foundation`)
- **Subcategory:** `css_framework`
- **Vendor / Type:** ZURB
- **Official Website:** [https://get.foundation](https://get.foundation)
- **Description:** Responsive frontend framework family for site and email development.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['foundation(\\.min)?\\.js']`; Stylesheets: `['foundation(\\.min)?\\.css']`; DOM Markers: `['data-dropdown-menu', 'data-topbar', 'data-off-canvas']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Identifiable via Foundation stylesheet or data-attribute markers.

### GSAP (`gsap`)
- **Subcategory:** `animation_library`
- **Vendor / Type:** GreenSock
- **Official Website:** [https://greensock.com/gsap/](https://greensock.com/gsap/)
- **Description:** Professional-grade JavaScript animation library for modern web performance.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['gsap(\\.min)?\\.js', 'TweenMax(\\.min)?\\.js', 'ScrollTrigger(\\.min)?\\.js']`; Inline JS Markers: `['gsap.timeline', 'window.gsap', 'TweenMax']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Observable via GreenSock script bundles or runtime global object.

### Gatsby (`gatsby`)
- **Subcategory:** `framework`
- **Vendor / Type:** Netlify
- **Official Website:** [https://www.gatsbyjs.com](https://www.gatsbyjs.com)
- **Description:** React-based open-source framework for creating websites and apps.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `react`, `javascript`
- **Detection Vectors:** Meta Generator regex: `['Gatsby\\s*([0-9\\.]+)?']`; Script URLs: `['component---src-pages-']`; DOM Markers: `['id:___gatsby']`
- **Version Extraction Rules:** meta_generator -> regex `Gatsby\s*([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### HTMX (`htmx`)
- **Subcategory:** `ui_library`
- **Vendor / Type:** Big Sky Software
- **Official Website:** [https://htmx.org](https://htmx.org)
- **Description:** High power-tools for HTML providing access to modern browser features.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['htmx\\.org', 'htmx(\\.min)?\\.js']`; DOM Markers: `['hx-get', 'hx-post', 'hx-target', 'hx-swap']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Lodash (`lodash`)
- **Subcategory:** `utility_library`
- **Vendor / Type:** OpenJS Foundation
- **Official Website:** [https://lodash.com](https://lodash.com)
- **Description:** Modern JavaScript utility library delivering modularity, performance, and extras.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['lodash(\\.min)?\\.js']`; Inline JS Markers: `['window._.debounce', 'window.lodash']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Observable via Lodash script reference or runtime namespace.

### Material UI (`material_ui`)
- **Subcategory:** `ui_library`
- **Vendor / Type:** MUI
- **Official Website:** [https://mui.com](https://mui.com)
- **Description:** Comprehensive suite of UI tools implementing Google Material Design in React.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `react`
- **Detection Vectors:** DOM Markers: `['MuiButton', 'MuiTypography', 'MuiBox']`; Body Classes: `['MuiButton-', 'MuiTypography-', 'MuiBox-', 'MuiGrid-']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Identifiable via Mui class name conventions on rendered elements.

### Next.js (`nextjs`)
- **Subcategory:** `framework`
- **Vendor / Type:** Vercel Inc.
- **Official Website:** [https://nextjs.org](https://nextjs.org)
- **Description:** React framework for production-grade full-stack web applications.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `react`, `javascript`
- **Detection Vectors:** Headers: `{'x-powered-by': 'Next\\.js\\s*([0-9\\.]+)?'}`; Script URLs: `['/_next/static/']`; Stylesheets: `['/_next/static/css/']`; DOM Markers: `['id:__next', 'script:__NEXT_DATA__']`; Inline JS Markers: `['__NEXT_DATA__', '__next_f', 'next/router']`
- **Version Extraction Rules:** header -> regex `Next\.js\s*([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Nuxt.js (`nuxt`)
- **Subcategory:** `framework`
- **Vendor / Type:** Nuxt Community
- **Official Website:** [https://nuxt.com](https://nuxt.com)
- **Description:** Intuitive Vue.js full-stack framework.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `vue`, `javascript`
- **Detection Vectors:** Script URLs: `['/_nuxt/']`; Stylesheets: `['/_nuxt/']`; DOM Markers: `['id:__nuxt']`; Inline JS Markers: `['window.__NUXT__', '__NUXT_DATA__']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Preact (`preact`)
- **Subcategory:** `ui_library`
- **Vendor / Type:** Jason Miller
- **Official Website:** [https://preactjs.com](https://preactjs.com)
- **Description:** Fast 3kB alternative to React with the same modern API.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['preact(\\.min)?\\.js', 'preact/hooks']`; Inline JS Markers: `['preact.h', 'window.preact']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation of Preact bundle or runtime global.

### Qwik (`qwik`)
- **Subcategory:** `framework`
- **Vendor / Type:** Builder.io
- **Official Website:** [https://qwik.dev](https://qwik.dev)
- **Description:** Resumable web framework delivering instant page loads through HTML serialization.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['/build/q-.*\\.js']`; DOM Markers: `['q:container', 'q:id', 'q:version', 'q:base']`; Inline JS Markers: `['window.qwikevents']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Passive identification via Qwik DOM attributes and container serialization markers.

### React (`react`)
- **Subcategory:** `ui_library`
- **Vendor / Type:** Meta Platforms Inc.
- **Official Website:** [https://react.dev](https://react.dev)
- **Description:** Declarative JavaScript library for building user interfaces.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['react\\.production\\.min\\.js', 'react-dom']`; DOM Markers: `['data-reactroot', 'data-reactid']`; Inline JS Markers: `['React.createElement', '_reactListening', '__REACT_DEVTOOLS_GLOBAL_HOOK__']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Remix (`remix`)
- **Subcategory:** `framework`
- **Vendor / Type:** Shopify Inc.
- **Official Website:** [https://remix.run](https://remix.run)
- **Description:** Full stack web framework built on React.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `react`, `javascript`
- **Detection Vectors:** Script URLs: `['/build/root-']`; Inline JS Markers: `['window.__remixContext', '__remixContext']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### SolidJS (`solidjs`)
- **Subcategory:** `ui_library`
- **Vendor / Type:** Ryan Carniato
- **Official Website:** [https://www.solidjs.com](https://www.solidjs.com)
- **Description:** Declarative, efficient, and flexible JavaScript library for building user interfaces.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['solid(-js)?(\\.production)?\\.js']`; DOM Markers: `['data-hk']`; Inline JS Markers: `['_$HY']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Observable via Solid hydration markers and client bundle signatures.

### Svelte (`svelte`)
- **Subcategory:** `ui_framework`
- **Vendor / Type:** Svelte Community
- **Official Website:** [https://svelte.dev](https://svelte.dev)
- **Description:** Cybernetically enhanced web apps with compile-time reactive components.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['svelte']`; DOM Markers: `['class*=svelte-']`; Inline JS Markers: `['__svelte__']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### SvelteKit (`sveltekit`)
- **Subcategory:** `framework`
- **Vendor / Type:** Svelte Community
- **Official Website:** [https://kit.svelte.dev](https://kit.svelte.dev)
- **Description:** Web development framework for building fast, resilient Svelte applications.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `svelte`, `javascript`
- **Detection Vectors:** Script URLs: `['/_app/immutable/']`; Stylesheets: `['/_app/immutable/assets/']`; Inline JS Markers: `['__sveltekit_']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Swiper (`swiper`)
- **Subcategory:** `ui_library`
- **Vendor / Type:** Vladimir Kharlampidi
- **Official Website:** [https://swiperjs.com](https://swiperjs.com)
- **Description:** Modern mobile touch slider with hardware-accelerated transitions.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['swiper(-bundle)?(\\.min)?\\.js']`; Stylesheets: `['swiper(-bundle)?(\\.min)?\\.css']`; DOM Markers: `['swiper-container', 'swiper-slide', 'swiper-wrapper']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Observable via Swiper slider CSS/JS bundles or container markup classes.

### Tailwind CSS (`tailwind`)
- **Subcategory:** `css_framework`
- **Vendor / Type:** Tailwind Labs Inc.
- **Official Website:** [https://tailwindcss.com](https://tailwindcss.com)
- **Description:** Utility-first CSS framework for rapid modern UI development.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['cdn\\.tailwindcss\\.com']`; Stylesheets: `['tailwind(\\.min)?\\.css']`; Body Classes: `['flex', 'grid', 'items-center', 'justify-center']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Compiled utility class names only hint at Tailwind unless CDN script or class clustering confirms.

### Three.js (`threejs`)
- **Subcategory:** `3d_graphics`
- **Vendor / Type:** Three.js Authors
- **Official Website:** [https://threejs.org](https://threejs.org)
- **Description:** JavaScript 3D library rendering WebGL graphics directly in the browser.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['three(\\.min)?\\.js', 'three\\.module\\.js']`; Inline JS Markers: `['THREE.WebGLRenderer', 'THREE.Scene']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Observable via Three.js library script or WebGL scene construction globals.

### Vue.js (`vue`)
- **Subcategory:** `ui_framework`
- **Vendor / Type:** Evan You / Community
- **Official Website:** [https://vuejs.org](https://vuejs.org)
- **Description:** Progressive JavaScript framework for building user interfaces.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['vue(\\.runtime)?(\\.min)?\\.js', '/vue/dist/']`; DOM Markers: `['vue:data-v', 'data-v-', 'id:__nuxt']`; Inline JS Markers: `['__VUE__', 'Vue.config', '__vue_app__']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### jQuery (`jquery`)
- **Subcategory:** `ui_library`
- **Vendor / Type:** OpenJS Foundation
- **Official Website:** [https://jquery.com](https://jquery.com)
- **Description:** Fast, small, and feature-rich JavaScript DOM manipulation library.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['jquery(\\.min)?\\.js(\\?.*)?$', 'jquery-([0-9\\.]+)(\\.min)?\\.js']`; Inline JS Markers: `['jQuery.fn.jquery', 'window.jQuery']`
- **Version Extraction Rules:** script_url -> regex `jquery-([0-9\.]+)(\.min)?\.js` (asset_hint_unverified)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

---

## Category: HOSTING (16 Technologies)

### Akamai (`akamai`)
- **Subcategory:** `cdn_proxy`
- **Vendor / Type:** Akamai Technologies
- **Official Website:** [https://www.akamai.com](https://www.akamai.com)
- **Description:** Global content delivery network, cybersecurity, and cloud service company.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Headers: `{'x-akamai-transformed': '.*', 'server': 'AkamaiGHost|AkamaiNetStorage'}`; Cookies: `['AKA_A2']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Amazon CloudFront (`cloudfront`)
- **Subcategory:** `cdn_proxy`
- **Vendor / Type:** Amazon Web Services Inc.
- **Official Website:** [https://aws.amazon.com/cloudfront/](https://aws.amazon.com/cloudfront/)
- **Description:** Low-latency content delivery network by Amazon Web Services.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-amz-cf-id': '.*', 'x-amz-cf-pop': '.*', 'via': '.*CloudFront.*'}`; Script URLs: `['\\.cloudfront\\.net']`; Stylesheets: `['\\.cloudfront\\.net']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Amazon Web Services (`aws`)
- **Subcategory:** `cloud_infrastructure`
- **Vendor / Type:** Amazon.com Inc.
- **Official Website:** [https://aws.amazon.com](https://aws.amazon.com)
- **Description:** Cloud computing platform offering storage, compute, and scalable backend infrastructure.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `asset_host`
- **Detection Vectors:** Headers: `{'x-amz-request-id': '.*', 'x-amz-id-2': '.*'}`; Asset URLs: `['s3\\.amazonaws\\.com', 's3-[a-z0-9\\-]+\\.amazonaws\\.com']` (Min: 2)
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** AWS asset storage does not establish origin application hosting provider or language.

### Bunny CDN (`bunny_cdn`)
- **Subcategory:** `cdn_proxy`
- **Vendor / Type:** BunnyWay d.o.o.
- **Official Website:** [https://bunny.net](https://bunny.net)
- **Description:** Fast, reliable and high-performance edge storage and content delivery network.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `asset_host`
- **Detection Vectors:** Headers: `{'server': 'BunnyCDN', 'b-cache': '.*'}`; Asset URLs: `['b-cdn\\.net']` (Min: 2)
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Cloudflare (`cloudflare`)
- **Subcategory:** `cdn_proxy`
- **Vendor / Type:** Cloudflare Inc.
- **Official Website:** [https://www.cloudflare.com](https://www.cloudflare.com)
- **Description:** Global cloud platform offering CDN, DDoS mitigation, and reverse proxy security.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': 'cloudflare', 'cf-ray': '.*', 'cf-cache-status': '.*'}`; Cookies: `['__cf_bm', 'cf_clearance']`; Script URLs: `['challenges\\.cloudflare\\.com', 'static\\.cloudflareinsights\\.com']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Cloudflare proxy does not prove origin hosting provider or backend language.

### DigitalOcean (`digitalocean`)
- **Subcategory:** `cloud_infrastructure`
- **Vendor / Type:** DigitalOcean LLC
- **Official Website:** [https://www.digitalocean.com](https://www.digitalocean.com)
- **Description:** Cloud infrastructure provider offering developer-friendly cloud services and Spaces object storage.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `asset_host`
- **Detection Vectors:** Headers: `{'x-do-app-origin': '.*', 'server': '^do-cdn'}`; Asset URLs: `['digitaloceanspaces\\.com']` (Min: 2)
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Fastly (`fastly`)
- **Subcategory:** `cdn_proxy`
- **Vendor / Type:** Fastly Inc.
- **Official Website:** [https://www.fastly.com](https://www.fastly.com)
- **Description:** Edge cloud platform and content delivery network.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-served-by': 'cache-.*', 'fastly-restarts': '.*', 'x-fastly-request-id': '.*'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Firebase Hosting (`firebase_hosting`)
- **Subcategory:** `cloud_hosting`
- **Vendor / Type:** Google Inc.
- **Official Website:** [https://firebase.google.com/products/hosting](https://firebase.google.com/products/hosting)
- **Description:** Fast and secure static and dynamic web hosting by Firebase.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-firebase-hosting': '.*', 'server': '^Firebase'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### GitHub Pages (`github_pages`)
- **Subcategory:** `static_hosting`
- **Vendor / Type:** GitHub Inc.
- **Official Website:** [https://pages.github.com](https://pages.github.com)
- **Description:** Static site hosting service directly from a GitHub repository.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': 'GitHub\\.com', 'x-github-request-id': '.*'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Google Cloud (`gcp`)
- **Subcategory:** `cloud_infrastructure`
- **Vendor / Type:** Google Inc.
- **Official Website:** [https://cloud.google.com](https://cloud.google.com)
- **Description:** Suite of cloud computing services running on Google's infrastructure.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `asset_host`
- **Detection Vectors:** Headers: `{'x-goog-generation': '.*', 'server': 'Google Frontend'}`; Asset URLs: `['storage\\.googleapis\\.com']` (Min: 2)
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Google Cloud storage does not establish origin application hosting or backend stack.

### Heroku (`heroku`)
- **Subcategory:** `cloud_hosting`
- **Vendor / Type:** Salesforce Inc.
- **Official Website:** [https://www.heroku.com](https://www.heroku.com)
- **Description:** Cloud platform as a service supporting several programming languages.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'via': '.*vegur.*', 'server': '^cowboy$'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### KeyCDN (`keycdn`)
- **Subcategory:** `cdn_proxy`
- **Vendor / Type:** Procon DC AG
- **Official Website:** [https://www.keycdn.com](https://www.keycdn.com)
- **Description:** High-performance content delivery network built for future speed.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `asset_host`
- **Detection Vectors:** Headers: `{'server': 'keycdn-engine'}`; Asset URLs: `['kxcdn\\.com']` (Min: 2)
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Microsoft Azure (`azure`)
- **Subcategory:** `cloud_infrastructure`
- **Vendor / Type:** Microsoft
- **Official Website:** [https://azure.microsoft.com](https://azure.microsoft.com)
- **Description:** Cloud computing platform with services for building, testing, deploying, and managing apps.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `asset_host`
- **Detection Vectors:** Headers: `{'x-ms-request-id': '.*', 'x-ms-blob-type': '.*'}`; Asset URLs: `['blob\\.core\\.windows\\.net', 'azureedge\\.net']` (Min: 2)
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Netlify (`netlify`)
- **Subcategory:** `cloud_hosting`
- **Vendor / Type:** Netlify Inc.
- **Official Website:** [https://www.netlify.com](https://www.netlify.com)
- **Description:** Composable web platform for modern web deployment and serverless.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': 'Netlify', 'x-nf-request-id': '.*'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Render (`render`)
- **Subcategory:** `cloud_hosting`
- **Vendor / Type:** Render Services Inc.
- **Official Website:** [https://render.com](https://render.com)
- **Description:** Unified cloud to build and run apps and websites with free SSL and global CDN.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-render-origin-server': '.*', 'rndr-id': '.*'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Vercel (`vercel`)
- **Subcategory:** `cloud_hosting`
- **Vendor / Type:** Vercel Inc.
- **Official Website:** [https://vercel.com](https://vercel.com)
- **Description:** Frontend cloud platform optimized for modern web frameworks.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-vercel-id': '.*', 'server': 'Vercel'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

---

## Category: LANGUAGE (17 Technologies)

### .NET / ASP.NET (`dotnet`)
- **Subcategory:** `server_framework`
- **Vendor / Type:** Microsoft
- **Official Website:** [https://dotnet.microsoft.com](https://dotnet.microsoft.com)
- **Description:** Open-source developer platform created by Microsoft for building web apps.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-aspnet-version': '([0-9\\.]+)'}`; DOM Markers: `['id:__VIEWSTATE', 'id:__EVENTVALIDATION']`
- **Version Extraction Rules:** header -> regex `x-aspnet-version:\s*([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### C# (`csharp`)
- **Subcategory:** `server_language`
- **Vendor / Type:** Microsoft
- **Official Website:** [https://learn.microsoft.com/dotnet/csharp/](https://learn.microsoft.com/dotnet/csharp/)
- **Description:** Modern, innovative, open-source object-oriented language for building .NET apps.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Implied Dependencies:** `dotnet`
- **Detection Vectors:** Headers: `{'x-powered-by': 'asp\\.net'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### CSS (`css`)
- **Subcategory:** `stylesheet_language`
- **Vendor / Type:** W3C
- **Official Website:** [https://www.w3.org/Style/CSS/](https://www.w3.org/Style/CSS/)
- **Description:** Cascading Style Sheets language for describing document presentation.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Stylesheets: `['\\.css(\\?.*)?$']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Elixir (`elixir`)
- **Subcategory:** `server_language`
- **Vendor / Type:** Elixir Community
- **Official Website:** [https://elixir-lang.org](https://elixir-lang.org)
- **Description:** Dynamic, functional language for building scalable and maintainable applications.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': 'cowboy', 'x-powered-by': 'phoenix'}`; Cookies: `['_csrf_token']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Erlang (`erlang`)
- **Subcategory:** `runtime_language`
- **Vendor / Type:** Ericsson
- **Official Website:** [https://www.erlang.org](https://www.erlang.org)
- **Description:** Programming language used to build massively scalable soft real-time systems.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': '(Cowboy|MochiWeb|Yaws)'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Observable only when underlying Erlang HTTP server headers are disclosed.

### Go (`go`)
- **Subcategory:** `server_language`
- **Vendor / Type:** Google Inc.
- **Official Website:** [https://go.dev](https://go.dev)
- **Description:** Open source programming language supported by Google for performant backend services.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': '\\b(golang|go-http-client)\\b|^go(/[\\d\\.]+)?'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### HTML (`html`)
- **Subcategory:** `markup_language`
- **Vendor / Type:** W3C / WHATWG
- **Official Website:** [https://whatwg.org](https://whatwg.org)
- **Description:** Standard markup language for documents designed to be displayed in a web browser.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Detection Vectors:** DOM Markers: `['html', 'body']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Java (`java`)
- **Subcategory:** `server_language`
- **Vendor / Type:** Oracle Corporation
- **Official Website:** [https://www.java.com](https://www.java.com)
- **Description:** Class-based, object-oriented server programming language.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': 'tomcat|jetty|jboss|wildfly|glassfish', 'x-powered-by': 'jsf|jsp|servlet'}`; Cookies: `['JSESSIONID']`; Script URLs: `['\\.jsp(\\?.*)?$']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### JavaScript (`javascript`)
- **Subcategory:** `scripting_language`
- **Vendor / Type:** ECMA International
- **Official Website:** [https://www.ecma-international.org](https://www.ecma-international.org)
- **Description:** High-level, just-in-time compiled programming language of the Web.
- **Confidence Weight:** `1.0`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['\\.js(\\?.*)?$', '\\.mjs(\\?.*)?$']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Kotlin (`kotlin`)
- **Subcategory:** `server_language`
- **Vendor / Type:** JetBrains
- **Official Website:** [https://kotlinlang.org](https://kotlinlang.org)
- **Description:** Modern multiplatform programming language targeting JVM, JS, and Native.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': 'Ktor(/[\\d\\.]+)?', 'x-powered-by': 'Ktor'}`; Script URLs: `['kotlin(\\.min)?\\.js']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Observable via Ktor server headers or Kotlin/JS script bundles.

### PHP (`php`)
- **Subcategory:** `server_language`
- **Vendor / Type:** The PHP Group
- **Official Website:** [https://www.php.net](https://www.php.net)
- **Description:** Popular server-side HTML-embedded scripting language.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-powered-by': 'php/?([0-9\\.]+)?', 'server': 'php/?([0-9\\.]+)?', 'set-cookie': 'PHPSESSID'}`; Cookies: `['PHPSESSID']`; Script URLs: `['\\.php(\\?.*)?$']`
- **Version Extraction Rules:** header -> regex `php/([0-9\.]+)` (explicit_version)
- **Detection Limitations:** Identified only when headers, cookies, or disclosed file extensions confirm PHP.

### Perl (`perl`)
- **Subcategory:** `scripting_language`
- **Vendor / Type:** The Perl Foundation
- **Official Website:** [https://www.perl.org](https://www.perl.org)
- **Description:** Highly capable, feature-rich programming language with over 36 years of development.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-powered-by': 'Perl', 'server': 'mod_perl(/[\\d\\.]+)?'}`; Cookies: `['dancer.session']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Identifiable via mod_perl headers or legacy Perl framework cookies.

### Python (`python`)
- **Subcategory:** `server_language`
- **Vendor / Type:** Python Software Foundation
- **Official Website:** [https://www.python.org](https://www.python.org)
- **Description:** Interpreted high-level general-purpose server programming language.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': '\\bpython(/[\\d\\.]+)?\\b|gunicorn|uvicorn', 'x-powered-by': 'python'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Identified only when Python WSGI/ASGI servers or framework cookies disclose presence.

### Ruby (`ruby`)
- **Subcategory:** `server_language`
- **Vendor / Type:** Ruby Community
- **Official Website:** [https://www.ruby-lang.org](https://www.ruby-lang.org)
- **Description:** Dynamic, open source programming language with a focus on simplicity and productivity.
- **Confidence Weight:** `0.9`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': 'puma|unicorn|passenger', 'x-powered-by': 'phusion passenger'}`; Cookies: `['_session_id']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Rust (`rust`)
- **Subcategory:** `server_language`
- **Vendor / Type:** Rust Foundation
- **Official Website:** [https://www.rust-lang.org](https://www.rust-lang.org)
- **Description:** Blazingly fast and memory-efficient systems and web programming language.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': 'actix|rocket|axum'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Scala (`scala`)
- **Subcategory:** `server_language`
- **Vendor / Type:** EPFL / Lightbend
- **Official Website:** [https://www.scala-lang.org](https://www.scala-lang.org)
- **Description:** Scala combines object-oriented and functional programming in one concise, high-level language.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'server': 'akka-http(/[\\d\\.]+)?', 'x-powered-by': 'Play Framework'}`; Cookies: `['PLAY_SESSION']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Observable via Play Framework or Akka HTTP server response headers.

### TypeScript (`typescript`)
- **Subcategory:** `compiled_language`
- **Vendor / Type:** Microsoft
- **Official Website:** [https://www.typescriptlang.org](https://www.typescriptlang.org)
- **Description:** Strict syntactical superset of JavaScript adding static typing.
- **Confidence Weight:** `0.85`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['\\.tsx?(\\?.*)?$', '\\.ts\\.map$']`; Inline JS Markers: `['sourceMappingURL=.*?\\.tsx?']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Compiled JavaScript does NOT prove TypeScript unless source maps or symbols disclose it.

---

## Category: MARKETING (4 Technologies)

### Brevo (`brevo`)
- **Subcategory:** `email_marketing`
- **Vendor / Type:** Brevo SAS
- **Official Website:** [https://www.brevo.com](https://www.brevo.com)
- **Description:** All-in-one digital marketing and CRM platform for small and medium businesses.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['sibautomation\\.com']`; Inline JS Markers: `['Brevo.push', 'sendinblue.track']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### HubSpot (`hubspot_marketing`)
- **Subcategory:** `inbound_marketing`
- **Vendor / Type:** HubSpot Inc.
- **Official Website:** [https://www.hubspot.com](https://www.hubspot.com)
- **Description:** CRM platform with marketing, sales, and customer service software.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['js\\.hs-scripts\\.com', 'js\\.hs-analytics\\.net']`; Inline JS Markers: `['_hsq.push']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Klaviyo (`klaviyo`)
- **Subcategory:** `marketing_automation`
- **Vendor / Type:** Klaviyo Inc.
- **Official Website:** [https://www.klaviyo.com](https://www.klaviyo.com)
- **Description:** Intelligent marketing automation and customer data platform for e-commerce.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['static\\.klaviyo\\.com/onsite/js/klaviyo\\.js']`; Inline JS Markers: `['_learnq.push']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Mailchimp (`mailchimp`)
- **Subcategory:** `email_marketing`
- **Vendor / Type:** Intuit Inc.
- **Official Website:** [https://mailchimp.com](https://mailchimp.com)
- **Description:** Marketing automation and email marketing platform.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['chimpstatic\\.com', 'downloads\\.mailchimp\\.com/js/signup-forms']`; DOM Markers: `['id:mc_embed_signup']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

---

## Category: PAYMENTS (5 Technologies)

### Adyen (`adyen`)
- **Subcategory:** `payment_gateway`
- **Vendor / Type:** Adyen N.V.
- **Official Website:** [https://www.adyen.com](https://www.adyen.com)
- **Description:** Global financial technology platform processing end-to-end payments.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['checkoutshopper-live\\.adyen\\.com/checkoutshopper/sdk/']`; Inline JS Markers: `['AdyenCheckout(']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Klarna (`klarna`)
- **Subcategory:** `bnpl`
- **Vendor / Type:** Klarna Bank AB
- **Official Website:** [https://www.klarna.com](https://www.klarna.com)
- **Description:** Buy now, pay later checkout and flexible digital payments.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['x\\.klarnacdn\\.net/kp/lib/v1/api\\.js']`; Inline JS Markers: `['Klarna.Payments.init']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### PayPal (`paypal`)
- **Subcategory:** `payment_gateway`
- **Vendor / Type:** PayPal Holdings Inc.
- **Official Website:** [https://www.paypal.com](https://www.paypal.com)
- **Description:** Global digital checkout and electronic payments platform.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['www\\.paypal\\.com/sdk/js', 'www\\.paypalobjects\\.com/api/checkout\\.js']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Razorpay (`razorpay`)
- **Subcategory:** `payment_gateway`
- **Vendor / Type:** Razorpay Software Private Limited
- **Official Website:** [https://razorpay.com](https://razorpay.com)
- **Description:** Full-stack financial services and payments platform in India.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['checkout\\.razorpay\\.com/v1/checkout\\.js']`; Inline JS Markers: `['Razorpay(']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Stripe (`stripe`)
- **Subcategory:** `payment_gateway`
- **Vendor / Type:** Stripe Inc.
- **Official Website:** [https://stripe.com](https://stripe.com)
- **Description:** Online payment processing infrastructure for internet businesses.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['js\\.stripe\\.com/v[23]/']`; Inline JS Markers: `['Stripe(', "elements.create('card'"]`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

---

## Category: SEARCH (4 Technologies)

### Algolia (`algolia`)
- **Subcategory:** `search_engine`
- **Vendor / Type:** Algolia Inc.
- **Official Website:** [https://www.algolia.com](https://www.algolia.com)
- **Description:** Flexible search and discovery hosted API engine.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['algoliasearch', 'instantsearch\\.js']`; Inline JS Markers: `['algoliasearch(', 'instantsearch(']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Elasticsearch (`elasticsearch`)
- **Subcategory:** `search_engine`
- **Vendor / Type:** Elastic N.V.
- **Official Website:** [https://www.elastic.co](https://www.elastic.co)
- **Description:** Distributed, RESTful search and analytics engine.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-elastic-product': 'Elasticsearch'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Private backend search engine. Detected only when explicitly disclosed in HTTP headers.

### Meilisearch (`meilisearch`)
- **Subcategory:** `search_engine`
- **Vendor / Type:** Meilisearch
- **Official Website:** [https://www.meilisearch.com](https://www.meilisearch.com)
- **Description:** Lightning-fast, ultra-relevant, and typo-tolerant search engine.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Script URLs: `['meilisearch']`; Inline JS Markers: `['new MeiliSearch(']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### OpenSearch (`opensearch`)
- **Subcategory:** `search_engine`
- **Vendor / Type:** OpenSearch Community
- **Official Website:** [https://opensearch.org](https://opensearch.org)
- **Description:** Open-source distributed search and analytics suite.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `first_party`
- **Detection Vectors:** Headers: `{'x-opensearch-version': '.*'}`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Private search cluster. Detected only when explicitly disclosed in HTTP headers.

---

## Category: SECURITY (3 Technologies)

### Cloudflare Turnstile (`cloudflare_turnstile`)
- **Subcategory:** `bot_protection`
- **Vendor / Type:** Cloudflare Inc.
- **Official Website:** [https://www.cloudflare.com/products/turnstile/](https://www.cloudflare.com/products/turnstile/)
- **Description:** User-friendly, privacy-preserving CAPTCHA replacement.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['challenges\\.cloudflare\\.com/turnstile/v0/api\\.js']`; DOM Markers: `['class:cf-turnstile']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Google reCAPTCHA (`recaptcha`)
- **Subcategory:** `bot_protection`
- **Vendor / Type:** Google Inc.
- **Official Website:** [https://www.google.com/recaptcha](https://www.google.com/recaptcha)
- **Description:** Security service defending websites from spam and abuse.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['google\\.com/recaptcha/api\\.js', 'gstatic\\.com/recaptcha/']`; DOM Markers: `['class:g-recaptcha']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### hCaptcha (`hcaptcha`)
- **Subcategory:** `bot_protection`
- **Vendor / Type:** Intuition Machines Inc.
- **Official Website:** [https://www.hcaptcha.com](https://www.hcaptcha.com)
- **Description:** Privacy-focused anti-bot and fraud defense solution.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['js\\.hcaptcha\\.com/1/api\\.js']`; DOM Markers: `['class:h-captcha']`; Inline JS Markers: `['hcaptcha.render']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

---

## Category: UX (6 Technologies)

### Crisp (`crisp`)
- **Subcategory:** `customer_messaging`
- **Vendor / Type:** Crisp IM SARL
- **Official Website:** [https://crisp.chat](https://crisp.chat)
- **Description:** All-in-one multichannel customer service and live chat platform.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['client\\.crisp\\.chat/l\\.js']`; Inline JS Markers: `['window.$crisp=[]', '$crisp.push']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### FullStory (`fullstory`)
- **Subcategory:** `session_replay`
- **Vendor / Type:** FullStory Inc.
- **Official Website:** [https://www.fullstory.com](https://www.fullstory.com)
- **Description:** Digital experience intelligence capturing user session replays and frustration signals.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['edge\\.fullstory\\.com/s/fs\\.js', 'fullstory\\.com/s/fs\\.js']`; Inline JS Markers: `["window['_fs_host'] = 'fullstory.com'"]`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Hotjar (`hotjar`)
- **Subcategory:** `behavior_analytics`
- **Vendor / Type:** Hotjar Ltd.
- **Official Website:** [https://www.hotjar.com](https://www.hotjar.com)
- **Description:** Product experience insights including heatmaps and behavior recordings.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['static\\.hotjar\\.com/c/hotjar-']`; Inline JS Markers: `['window.hj=window.hj||function', '_hjSettings']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Intercom (`intercom`)
- **Subcategory:** `customer_messaging`
- **Vendor / Type:** Intercom Inc.
- **Official Website:** [https://www.intercom.com](https://www.intercom.com)
- **Description:** Customer messaging platform with live chat, AI bots, and help desk capabilities.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['widget\\.intercom\\.io/widget/']`; Inline JS Markers: `["Intercom('boot'", 'window.Intercom']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Microsoft Clarity (`microsoft_clarity`)
- **Subcategory:** `behavior_analytics`
- **Vendor / Type:** Microsoft
- **Official Website:** [https://clarity.microsoft.com](https://clarity.microsoft.com)
- **Description:** Free behavioral analytics tool capturing heatmaps and session playbacks.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['www\\.clarity\\.ms/tag/']`; Inline JS Markers: `['window.clarity=window.clarity||function']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

### Zendesk (`zendesk`)
- **Subcategory:** `customer_support`
- **Vendor / Type:** Zendesk Inc.
- **Official Website:** [https://www.zendesk.com](https://www.zendesk.com)
- **Description:** Customer service software and support ticketing system with live chat widget.
- **Confidence Weight:** `0.95`
- **Default Provenance:** `third_party_embed`
- **Detection Vectors:** Script URLs: `['static\\.zdassets\\.com/ekr/snippet\\.js']`; Inline JS Markers: `["zE('webWidget'", 'window.zEmbed']`
- **Version Extraction:** Not publicly disclosed
- **Detection Limitations:** Client-side observation only. Server-side configuration may vary.

---

## Catalog Update Procedure

To add, update, or deprecate a technology fingerprint in the catalog:
1. **Verify Evidence Boundaries**: Ensure the proposed technology signature relies on publicly observable HTTP response headers, meta generator tags, script src URLs, stylesheets, or DOM attributes. Never write rules requiring access to private admin paths, authenticated endpoints, or port scans.
2. **Define in `backend/app/technology/fingerprints/catalog.py`**: Instantiate `TechnologyFingerprint` with strict types.
3. **Provide Implied Dependencies & Limitations**: Clearly articulate implied technologies (`implies=['react']`) and explicit limitations so the engine does not overclaim detections.
4. **Add Positive and Negative Test Fixtures**: Add test cases to `backend/tests/test_technology_cp2_catalog.py` or `backend/tests/test_technology_cp3_catalog.py` asserting confidence and provenance.
5. **Validate Catalog Integrity**: Ensure `catalog.validate_catalog()` passes without duplicate IDs, invalid regexes, or out-of-range confidence weights.
