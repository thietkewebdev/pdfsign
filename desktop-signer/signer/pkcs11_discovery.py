"""
PKCS#11 DLL discovery for Windows.
Scans common directories for PKCS#11 modules (Viettel, VNPT, EasyCA, BKAV, FPT, etc.).
"""
import os
import ctypes
from pathlib import Path
from typing import Optional

# Heuristic filename patterns for PKCS#11 DLLs
DLL_PATTERNS = (
    "pkcs11",
    "csp11",
    "viettel",
    "vnpt",
    "easyca",
    "bkav",
    "fpt",
    "etoken",
    "safenet",
)

# Directories to scan (Windows) - include subdirs for vendor-specific paths
SCAN_DIRS = [
    Path(r"C:\Windows\System32"),
    Path(r"C:\Program Files"),
    Path(r"C:\Program Files (x86)"),
]
MAX_SCAN_DEPTH = 2  # Limit recursion for performance


def _has_get_function_list(dll_path: Path) -> bool:
    """Validate DLL has C_GetFunctionList symbol (required for PKCS#11)."""
    try:
        lib = ctypes.CDLL(str(dll_path))
        return hasattr(lib, "C_GetFunctionList")
    except (OSError, AttributeError):
        return False


def _matches_heuristic(name: str) -> bool:
    """Check if filename matches PKCS#11 heuristic."""
    lower = name.lower()
    return any(p in lower for p in DLL_PATTERNS)


def _iter_dlls(base: Path, depth: int = 0) -> list[Path]:
    """Recursively find PKCS#11 DLLs. Limit depth for Program Files subdirs."""
    found: list[Path] = []
    if depth > MAX_SCAN_DEPTH:
        return found
    try:
        for item in base.iterdir():
            if item.is_dir() and depth < MAX_SCAN_DEPTH:
                if _matches_heuristic(item.name) or depth == 0:
                    found.extend(_iter_dlls(item, depth + 1))
            elif item.is_file() and item.suffix.lower() == ".dll":
                if _matches_heuristic(item.name) and _has_get_function_list(item):
                    found.append(item)
    except PermissionError:
        pass
    return found


def find_pkcs11_dlls() -> list[Path]:
    """
    Scan for valid PKCS#11 DLLs.
    Returns list of paths to DLLs that have C_GetFunctionList.
    """
    seen: set[Path] = set()
    candidates: list[Path] = []

    for base_dir in SCAN_DIRS:
        if not base_dir.exists():
            continue
        for item in _iter_dlls(base_dir):
            key = item.resolve()
            if key not in seen:
                seen.add(key)
                candidates.append(item)

    return candidates


def get_pkcs11_dll(env_override: Optional[str] = None) -> Path:
    """
    Get PKCS#11 DLL path.
    Uses PKCS11_DLL env var if set, otherwise scans and returns first valid DLL.
    """
    if env_override:
        path = Path(env_override)
        if path.exists() and _has_get_function_list(path):
            return path
        raise FileNotFoundError(
            f"PKCS11_DLL={env_override} not found or invalid (missing C_GetFunctionList)"
        )

    dlls = find_pkcs11_dlls()
    if not dlls:
        raise FileNotFoundError(
            "No PKCS#11 DLL found. Set PKCS11_DLL env var or install a token driver "
            "(Viettel, VNPT, EasyCA, BKAV, FPT, etc.)."
        )
    return dlls[0]
