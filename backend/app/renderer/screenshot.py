"""Screenshot capture service with bounded dimensions and sanitized file storage."""

import logging
import pathlib
from typing import Optional, Tuple
import uuid
from playwright.async_api import Page

logger = logging.getLogger("screenshot")


class ScreenshotService:
    """Manages secure desktop and mobile viewport screenshots."""

    @staticmethod
    async def capture(
        page: Page,
        audit_id: uuid.UUID,
        page_id: uuid.UUID,
        storage_base_dir: str = "./storage/screenshots",
        desktop_dims: Tuple[int, int] = (1280, 800),
        mobile_dims: Tuple[int, int] = (375, 667),
    ) -> Tuple[Optional[str], Optional[str]]:
        """Capture desktop and mobile screenshots and return their relative storage paths."""
        audit_folder = pathlib.Path(storage_base_dir) / str(audit_id)
        audit_folder.mkdir(parents=True, exist_ok=True)

        # Strictly sanitized UUID-based filenames (never use raw URLs or user input)
        desktop_filename = f"{page_id}_desktop.jpg"
        mobile_filename = f"{page_id}_mobile.jpg"

        desktop_file = audit_folder / desktop_filename
        mobile_file = audit_folder / mobile_filename

        desktop_rel: Optional[str] = None
        mobile_rel: Optional[str] = None

        # 1. Desktop viewport capture
        try:
            await page.set_viewport_size({"width": desktop_dims[0], "height": desktop_dims[1]})
            await page.screenshot(
                path=str(desktop_file),
                type="jpeg",
                quality=75,
                full_page=False,
            )
            desktop_rel = f"screenshots/{audit_id}/{desktop_filename}"
        except Exception as e:
            logger.warning(f"Desktop screenshot failed for page {page_id}: {e}")

        # 2. Mobile viewport capture
        try:
            await page.set_viewport_size({"width": mobile_dims[0], "height": mobile_dims[1]})
            await page.screenshot(
                path=str(mobile_file),
                type="jpeg",
                quality=75,
                full_page=False,
            )
            mobile_rel = f"screenshots/{audit_id}/{mobile_filename}"
        except Exception as e:
            logger.warning(f"Mobile screenshot failed for page {page_id}: {e}")

        return desktop_rel, mobile_rel
