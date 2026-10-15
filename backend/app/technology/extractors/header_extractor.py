"""Passive HTTP response header technology signal extractor."""

import re
from typing import Dict, List, Optional
from app.technology.models import (
    DetectionMethod,
    EvidenceItem,
    EvidenceType,
)


class HeaderTechnologyExtractor:
    """Extracts non-sensitive technology evidence from HTTP response headers."""

    # Explicit list of headers that may indicate web technologies or frameworks
    INTERESTING_HEADERS = {
        "server",
        "x-powered-by",
        "x-generator",
        "x-aspnet-version",
        "x-aspnetmvc-version",
        "x-drupal-cache",
        "x-shopify-stage",
        "x-wix-request-id",
        "x-wix-published-version",
        "x-nextjs-cache",
        "x-nextjs-matched-path",
        "x-varnish",
        "x-ghost-cache-status",
        "set-cookie",
    }

    # Cookie name signatures that strongly identify frameworks/platforms
    KNOWN_COOKIE_NAMES = {
        "phpsessid": ("php", "PHP session cookie (PHPSESSID)"),
        "laravel_session": ("laravel", "Laravel session cookie (laravel_session)"),
        "csrftoken": ("django", "Django CSRF token cookie (csrftoken)"),
        "connect.sid": ("nodejs", "Node.js Express session cookie (connect.sid)"),
        "_shopify_s": ("shopify", "Shopify tracking/session cookie"),
        "_shopify_y": ("shopify", "Shopify storefront cookie"),
        "wixsession": ("wix", "Wix session cookie"),
    }

    @classmethod
    def extract(cls, headers: Dict[str, str], page_url: str = "") -> List[EvidenceItem]:
        """Extract bounded evidence items from response headers."""
        if not headers:
            return []

        evidence: List[EvidenceItem] = []
        lowered = {str(k).strip().lower(): str(v).strip() for k, v in headers.items()}

        # 1. X-Powered-By
        x_powered = lowered.get("x-powered-by")
        if x_powered:
            # Bound header length
            safe_val = x_powered[:200]
            evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:x-powered-by",
                    evidence_summary=f"HTTP X-Powered-By header: {safe_val}",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal=safe_val,
                    weight=0.9,
                )
            )

        # 2. X-Generator
        x_gen = lowered.get("x-generator")
        if x_gen:
            safe_val = x_gen[:200]
            evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:x-generator",
                    evidence_summary=f"HTTP X-Generator header: {safe_val}",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal=safe_val,
                    weight=0.95,
                )
            )

        # 3. Server header
        server_val = lowered.get("server")
        if server_val:
            safe_val = server_val[:200]
            evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:server",
                    evidence_summary=f"HTTP Server header: {safe_val}",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal=safe_val,
                    weight=0.5,
                )
            )

        # 4. Platform specific headers
        for h_name, h_val in lowered.items():
            if h_name.startswith("x-wix-"):
                evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.header.value,
                        evidence_source=f"header:{h_name}",
                        evidence_summary=f"Wix infrastructure header: {h_name}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.header_analysis.value,
                        raw_signal=h_name,
                        weight=0.9,
                    )
                )
            elif h_name.startswith("x-shopify-"):
                evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.header.value,
                        evidence_source=f"header:{h_name}",
                        evidence_summary=f"Shopify infrastructure header: {h_name}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.header_analysis.value,
                        raw_signal=h_name,
                        weight=0.9,
                    )
                )
            elif h_name.startswith("x-nextjs-"):
                evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.header.value,
                        evidence_source=f"header:{h_name}",
                        evidence_summary=f"Next.js infrastructure header: {h_name}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.header_analysis.value,
                        raw_signal=h_name,
                        weight=0.9,
                    )
                )

        # 5. Set-Cookie inspection (names only, NEVER values)
        set_cookie = lowered.get("set-cookie")
        if set_cookie:
            # Extract cookie names only
            cookie_names = [
                m.group(1).lower()
                for m in re.finditer(r"([a-zA-Z0-9_\-\.]+)\s*=", set_cookie)
            ]
            for c_name in set(cookie_names):
                if c_name in cls.KNOWN_COOKIE_NAMES:
                    tech_id, desc = cls.KNOWN_COOKIE_NAMES[c_name]
                    evidence.append(
                        EvidenceItem(
                            evidence_type=EvidenceType.header.value,
                            evidence_source="header:set-cookie",
                            evidence_summary=f"Identified {desc}",
                            observed_page_or_url=page_url,
                            detection_method=DetectionMethod.header_analysis.value,
                            raw_signal=f"cookie:{c_name}",
                            weight=0.85,
                        )
                    )

        return evidence
