"""
PKCS#11 DLL discovery for Windows.
Scans common directories for PKCS#11 modules (Viettel, VNPT, CA2, FPT, Newtel, One-CA,
SmartSign, EFY, TrustCA, MISA, CMC, EasyCA, BKAV, SafeNet, etc.).
"""
import ctypes
import re
from pathlib import Path
from typing import Optional

# Heuristic filename patterns for PKCS#11 DLLs (substring match; still validated via
# C_GetFunctionList). Covers Viettel, VNPT, CA2, FPT, Newtel, SAFE/SafeNet, SmartSign,
# EFY, TrustCA, MISA, CMC, One-CA, EasyCA, BKAV, eToken, etc.
DLL_PATTERNS = (
    "pkcs11",
    "csp11",
    "viettel",
    "vnpt",
    "ca2",
    "fpt",
    "newtel",
    "safe",
    "safenet",
    "smartsign",
    "efy",
    "trustca",
    "trust-ca",
    "misa",
    "cmc",
    "oneca",
    "one-ca",
    "easyca",
    "bkav",
    "etoken",
)

# Directories to scan (Windows) - include subdirs for vendor-specific paths
SCAN_DIRS = [
    Path(r"C:\Windows\System32"),
    Path(r"C:\Program Files"),
    Path(r"C:\Program Files (x86)"),
]
MAX_SCAN_DEPTH = 2  # Limit recursion for performance (non-vendor paths)
# Vendors often install PKCS#11 under Program Files\<Vendor>\...\subfolders
# whose names do not match DLL_PATTERNS; follow the whole subtree once vendor dir is seen.
MAX_SCAN_DEPTH_VENDOR = 8

# Prefer these when multiple PKCS#11 DLLs exist (Foxit may work via CSP while another
# vendor's PKCS#11 loads first and reports no token).
_PREFERRED_VIETTEL_DLLS = [
    Path(r"C:\Windows\System32\viettel-ca_v6.dll"),
    Path(r"C:\Windows\System32\viettel-ca_v5.dll"),
    Path(r"C:\Windows\System32\viettel-ca_v4.dll"),
    Path(r"C:\Windows\System32\viettel-ca_v3.dll"),
    Path(r"C:\Windows\System32\viettel-ca_v2.dll"),
    Path(r"C:\Windows\System32\viettel-ca_v1.dll"),
    Path(r"C:\Windows\System32\viettel-ca.dll"),
]


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


# Program Files\<Vendor>\... trees where PKCS#11 DLLs are often nested deeply.
_VENDOR_DIR_MARKERS = (
    "viettel",
    "vnpt",
    "ca2",
    "fpt",
    "newtel",
    "smartsign",
    "efy",
    "trustca",
    "trust-ca",
    "misa",
    "cmc",
    "safe",
    "safenet",
    "safesign",
    "oneca",
    "one-ca",
    "one_ca",
    "bkav",
    "easyca",
    "easysign",
)


def _vendor_deep_subtree_dir(name: str) -> bool:
    """Folder names that typically contain deep PKCS#11 installs (scan full subtree)."""
    n = name.lower()
    return any(m in n for m in _VENDOR_DIR_MARKERS)


def _iter_dlls(
    base: Path, depth: int = 0, in_vendor_subtree: bool = False
) -> list[Path]:
    """Recursively find PKCS#11 DLLs. Deeper scan under known vendor install trees."""
    max_depth = MAX_SCAN_DEPTH_VENDOR if in_vendor_subtree else MAX_SCAN_DEPTH
    found: list[Path] = []
    if depth > max_depth:
        return found
    try:
        for item in base.iterdir():
            if item.is_dir() and depth < max_depth:
                child_vendor = in_vendor_subtree or _vendor_deep_subtree_dir(item.name)
                enter = depth == 0 or _matches_heuristic(item.name) or in_vendor_subtree
                if enter:
                    found.extend(_iter_dlls(item, depth + 1, child_vendor))
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


def _pick_pkcs11_dll(candidates: list[Path]) -> Path:
    """If several modules exist, prefer Viettel (common cause: wrong DLL = empty slots)."""
    if len(candidates) == 1:
        return candidates[0]

    by_resolved = {p.resolve(): p for p in candidates}
    for preferred in _PREFERRED_VIETTEL_DLLS:
        try:
            key = preferred.resolve()
        except OSError:
            continue
        if key in by_resolved:
            return by_resolved[key]

    viettel = [
        p
        for p in candidates
        if "viettel" in p.name.lower() or "viettel" in str(p.resolve()).lower()
    ]
    if len(viettel) == 1:
        return viettel[0]
    if len(viettel) > 1:

        def _viettel_version(p: Path) -> int:
            m = re.search(r"_v(\d+)", p.name, re.I)
            return int(m.group(1)) if m else -1

        # Newer Token Manager = higher vN; plain viettel-ca.dll last among Viettel names
        return sorted(viettel, key=lambda p: (_viettel_version(p), p.name.lower()))[-1]

    return sorted(candidates, key=lambda p: str(p).lower())[0]


def get_pkcs11_dll(env_override: Optional[str] = None) -> Path:
    """
    Get PKCS#11 DLL path.
    Uses PKCS11_DLL env var if set; otherwise scans and picks a module (Viettel preferred
    when multiple PKCS#11 DLLs exist).
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
            "(Viettel, VNPT, CA2, FPT, Newtel, One-CA, SmartSign, EFY, TrustCA, MISA, CMC, "
            "EasyCA, BKAV, SafeNet, etc.)."
        )
    return _pick_pkcs11_dll(dlls)


def ordered_pkcs11_dll_candidates(env_override: Optional[str] = None) -> list[Path]:
    """
    All discovered PKCS#11 DLLs, vendor-priority first (same as get_pkcs11_dll).
    Used to retry listing when the first module reports no token (wrong DLL).
    """
    if env_override:
        return [get_pkcs11_dll(env_override)]
    dlls = find_pkcs11_dlls()
    if not dlls:
        raise FileNotFoundError(
            "No PKCS#11 DLL found. Set PKCS11_DLL env var or install a token driver "
            "(Viettel, VNPT, CA2, FPT, Newtel, One-CA, SmartSign, EFY, TrustCA, MISA, CMC, "
            "EasyCA, BKAV, SafeNet, etc.)."
        )
    primary = _pick_pkcs11_dll(dlls)
    rest = sorted(
        (d for d in dlls if d.resolve() != primary.resolve()),
        key=lambda p: str(p).lower(),
    )
    return [primary] + rest
