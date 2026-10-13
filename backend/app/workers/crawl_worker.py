"""Background crawl worker process with atomic SQLite job claiming and heartbeats."""

import asyncio
import logging
import os
import signal
import sys
import uuid
from typing import Optional

from app.database.session import get_session_factory
from app.repositories.crawl_repository import CrawlRepository
from app.services.crawl_service import CrawlService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("crawl_worker")


class CrawlWorker:
    """Continuous polling worker process claiming and executing audit crawl jobs."""

    def __init__(
        self,
        worker_id: Optional[str] = None,
        poll_interval: float = 2.0,
        lease_seconds: int = 60,
    ) -> None:
        self.worker_id = worker_id or f"worker-{os.getpid()}-{uuid.uuid4().hex[:6]}"
        self.poll_interval = poll_interval
        self.lease_seconds = lease_seconds
        self.stop_requested = False

    def request_stop(self, *args) -> None:
        logger.info(f"Stop signal received for worker {self.worker_id}. Shutting down gracefully...")
        self.stop_requested = True

    async def run(self) -> None:
        """Main worker execution loop."""
        logger.info(f"Starting CrawlWorker [{self.worker_id}] with poll_interval={self.poll_interval}s, lease={self.lease_seconds}s")

        while not self.stop_requested:
            try:
                claimed = await self._claim_and_process()
                if not claimed and not self.stop_requested:
                    await asyncio.sleep(self.poll_interval)
            except Exception as e:
                logger.error(f"Worker loop encountered error: {e}", exc_info=True)
                if not self.stop_requested:
                    await asyncio.sleep(self.poll_interval)

        logger.info(f"CrawlWorker [{self.worker_id}] stopped cleanly.")

    async def _claim_and_process(self) -> bool:
        """Attempt to claim and execute one queued job."""
        session_factory = get_session_factory()
        audit_id = None

        async with session_factory() as session:
            crawl_repo = CrawlRepository(session)
            audit = await crawl_repo.claim_next_job(
                worker_token=self.worker_id,
                lease_seconds=self.lease_seconds,
            )

            if not audit:
                return False

            audit_id = audit.id
            logger.info(f"Worker [{self.worker_id}] successfully claimed audit {audit_id} for {audit.target_url}")

        # Execute crawl in fresh session context
        async with session_factory() as session:
            service = CrawlService(session)
            await service.execute_crawl(
                audit_id=audit_id,
                worker_token=self.worker_id,
            )

        return True


def main() -> None:
    worker = CrawlWorker()

    # Register OS signals
    if sys.platform != "win32":
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, worker.request_stop)
    else:
        signal.signal(signal.SIGINT, worker.request_stop)
        signal.signal(signal.SIGTERM, worker.request_stop)

    try:
        asyncio.run(worker.run())
    except KeyboardInterrupt:
        logger.info("Worker interrupted via keyboard. Exiting.")


if __name__ == "__main__":
    main()
