"""Repository for persisting and querying audit scorecards and prioritized action items."""

import uuid
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.models import AuditPriorityItem, AuditScorecard, utc_now


class ScoringRepository:
    """Async database repository for AuditScorecard and AuditPriorityItem records."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_scorecard(self, audit_id: uuid.UUID) -> Optional[AuditScorecard]:
        """Fetch scorecard by audit ID."""
        stmt = select(AuditScorecard).where(AuditScorecard.audit_id == audit_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def save_scorecard(
        self,
        scorecard_data: Dict[str, Any],
        priority_items_data: List[Dict[str, Any]],
    ) -> AuditScorecard:
        """Atomically upsert scorecard and replace associated priority items."""
        audit_id = scorecard_data["audit_id"]

        # 1. Fetch or create scorecard
        existing_card = await self.get_scorecard(audit_id)
        if existing_card:
            for k, v in scorecard_data.items():
                if hasattr(existing_card, k) and k != "id":
                    setattr(existing_card, k, v)
            existing_card.updated_at = utc_now()
            scorecard = existing_card
        else:
            scorecard = AuditScorecard(**scorecard_data)
            self.db.add(scorecard)

        await self.db.flush()

        # 2. Replace priority items for this audit
        await self.db.execute(
            delete(AuditPriorityItem).where(AuditPriorityItem.audit_id == audit_id)
        )

        for p_data in priority_items_data:
            item = AuditPriorityItem(
                audit_id=audit_id,
                scorecard_id=scorecard.id,
                priority_tier=p_data["priority_tier"],
                priority_rank=p_data["priority_rank"],
                group_fingerprint=p_data["group_fingerprint"],
                rule_id=p_data["rule_id"],
                category=p_data["category"],
                title=p_data["title"],
                description=p_data.get("description", ""),
                recommendation=p_data["recommendation"],
                affected_page_count=p_data.get("affected_page_count", 1),
                affected_urls_json=p_data.get("affected_urls_json", []),
                rule_ids_json=p_data.get("rule_ids_json", []),
                evidence_json=p_data.get("evidence_json", {}),
                score_impact=p_data.get("score_impact", 0.0),
            )
            self.db.add(item)

        await self.db.commit()
        await self.db.refresh(scorecard)
        return scorecard

    async def get_priority_items(
        self,
        audit_id: uuid.UUID,
        priority_tier: Optional[str] = None,
        category: Optional[str] = None,
        rule_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[AuditPriorityItem], int, Dict[str, int]]:
        """Query paginated, filterable priority items and aggregate tier counts."""
        # 1. Tier counts aggregation
        counts_stmt = (
            select(AuditPriorityItem.priority_tier, func.count(AuditPriorityItem.id))
            .where(AuditPriorityItem.audit_id == audit_id)
            .group_by(AuditPriorityItem.priority_tier)
        )
        counts_res = await self.db.execute(counts_stmt)
        tier_counts = {"P0": 0, "P1": 0, "P2": 0, "P3": 0}
        for tier, cnt in counts_res.all():
            if tier in tier_counts:
                tier_counts[tier] = cnt

        # 2. Filtered count
        base_filters = [AuditPriorityItem.audit_id == audit_id]
        if priority_tier:
            base_filters.append(AuditPriorityItem.priority_tier == priority_tier.upper())
        if category:
            base_filters.append(AuditPriorityItem.category == category.lower())
        if rule_id:
            base_filters.append(AuditPriorityItem.rule_id == rule_id)

        count_stmt = select(func.count(AuditPriorityItem.id)).where(*base_filters)
        total = (await self.db.execute(count_stmt)).scalar_one()

        # 3. Paginated items
        items_stmt = (
            select(AuditPriorityItem)
            .where(*base_filters)
            .order_by(AuditPriorityItem.priority_rank.asc())
            .offset(offset)
            .limit(limit)
        )
        items = (await self.db.execute(items_stmt)).scalars().all()

        return list(items), total, tier_counts
