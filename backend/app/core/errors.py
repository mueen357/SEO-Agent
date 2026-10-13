"""Application exception classes and unified error response structures."""

from typing import Any, Optional
from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Any] = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, details: Optional[Any] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found", details: Optional[Any] = None):
        super().__init__(code="NOT_FOUND", message=message, status_code=404, details=details)


class ValidationError(AppError):
    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(code="VALIDATION_ERROR", message=message, status_code=422, details=details)


class ConflictError(AppError):
    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(code="CONFLICT", message=message, status_code=409, details=details)


class DisallowedURLError(AppError):
    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(code="DISALLOWED_URL", message=message, status_code=400, details=details)


class DNSResolutionError(AppError):
    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(code="DNS_RESOLUTION_FAILED", message=message, status_code=400, details=details)
