"""Central registry of recognizable web technologies, categories, and signature patterns."""

from dataclasses import dataclass, field
from typing import Dict, List, Optional
from app.technology.models import TechnologyCategory


@dataclass
class TechnologyDefinition:
    """Static metadata for a supported technology."""
    id: str
    name: str
    category: TechnologyCategory
    website: str
    description: str
    implies: List[str] = field(default_factory=list)  # e.g. nextjs implies react; nuxt implies vue


class TechnologyRegistry:
    """Registry maintaining authoritative definitions of detectable technologies."""

    _DEFINITIONS: Dict[str, TechnologyDefinition] = {
        # CMS / Website Builders
        "wordpress": TechnologyDefinition(
            id="wordpress",
            name="WordPress",
            category=TechnologyCategory.cms,
            website="https://wordpress.org",
            description="Open-source Content Management System powering web publishing.",
            implies=["php"],
        ),
        "shopify": TechnologyDefinition(
            id="shopify",
            name="Shopify",
            category=TechnologyCategory.cms,
            website="https://www.shopify.com",
            description="E-commerce and online storefront platform.",
        ),
        "wix": TechnologyDefinition(
            id="wix",
            name="Wix",
            category=TechnologyCategory.cms,
            website="https://www.wix.com",
            description="Cloud-based website builder platform.",
        ),
        "webflow": TechnologyDefinition(
            id="webflow",
            name="Webflow",
            category=TechnologyCategory.cms,
            website="https://webflow.com",
            description="Visual website development and CMS platform.",
        ),
        "squarespace": TechnologyDefinition(
            id="squarespace",
            name="Squarespace",
            category=TechnologyCategory.cms,
            website="https://www.squarespace.com",
            description="Website builder and hosting platform.",
        ),

        # Frontend Frameworks & Libraries
        "react": TechnologyDefinition(
            id="react",
            name="React",
            category=TechnologyCategory.frontend,
            website="https://react.dev",
            description="Declarative JavaScript library for building user interfaces.",
        ),
        "nextjs": TechnologyDefinition(
            id="nextjs",
            name="Next.js",
            category=TechnologyCategory.frontend,
            website="https://nextjs.org",
            description="React framework for production-grade full-stack web applications.",
            implies=["react"],
        ),
        "vue": TechnologyDefinition(
            id="vue",
            name="Vue.js",
            category=TechnologyCategory.frontend,
            website="https://vuejs.org",
            description="Progressive JavaScript framework for building web user interfaces.",
        ),
        "nuxt": TechnologyDefinition(
            id="nuxt",
            name="Nuxt.js",
            category=TechnologyCategory.frontend,
            website="https://nuxt.com",
            description="Intuitive Vue.js web development framework.",
            implies=["vue"],
        ),
        "angular": TechnologyDefinition(
            id="angular",
            name="Angular",
            category=TechnologyCategory.frontend,
            website="https://angular.dev",
            description="TypeScript-based open-source web application framework.",
        ),

        # Backend Runtimes & Frameworks
        "php": TechnologyDefinition(
            id="php",
            name="PHP",
            category=TechnologyCategory.backend,
            website="https://www.php.net",
            description="Server-side web scripting language.",
        ),
        "nodejs": TechnologyDefinition(
            id="nodejs",
            name="Node.js",
            category=TechnologyCategory.backend,
            website="https://nodejs.org",
            description="Asynchronous event-driven JavaScript backend runtime.",
        ),
        "laravel": TechnologyDefinition(
            id="laravel",
            name="Laravel",
            category=TechnologyCategory.backend,
            website="https://laravel.com",
            description="PHP web framework with expressive, elegant syntax.",
            implies=["php"],
        ),
        "django": TechnologyDefinition(
            id="django",
            name="Django",
            category=TechnologyCategory.backend,
            website="https://www.djangoproject.com",
            description="High-level Python web framework.",
        ),
    }

    @classmethod
    def get(cls, tech_id: str) -> Optional[TechnologyDefinition]:
        return cls._DEFINITIONS.get(tech_id)

    @classmethod
    def get_all(cls) -> Dict[str, TechnologyDefinition]:
        return dict(cls._DEFINITIONS)

    @classmethod
    def get_by_category(cls, category: TechnologyCategory) -> List[TechnologyDefinition]:
        return [t for t in cls._DEFINITIONS.values() if t.category == category]
