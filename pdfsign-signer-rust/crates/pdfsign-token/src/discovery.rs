//! PKCS#11 module discovery.
//!
//! Windows logic is a port of `desktop-signer/signer/pkcs11_discovery.py` (the code
//! `PDFSignProSignerCore.exe` runs for the WPF app): same filename patterns, vendor folder
//! markers, scan roots, depth limits and Viettel-first ordering. The WPF installer does not
//! ship vendor drivers; it relies on the CA's own token software having installed them.
//!
//! macOS/Linux candidates are NOT from the WPF code (it is Windows-only); see docs/ANALYSIS.md.

use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Filename substrings (case-insensitive) that mark a candidate PKCS#11 module.
/// Verbatim from `DLL_PATTERNS` in pkcs11_discovery.py.
pub const DLL_PATTERNS: &[&str] = &[
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
    // Feitian / Watchdata / G+D / OpenSC / Thales / Atos / A.E.T. / Gemalto / CA2 / SAVIS /
    // SoftDreams / WinCA / NewCA / K-Sign middleware names.
    "ngp11",
    "castle",
    "epass",
    "eps2003",
    "shuttle",
    "ftpkcs11",
    "ftsafe",
    "wdpkcs",
    "watchdata",
    "aetpkss",
    "opensc",
    "idprime",
    "starcos",
    "cardos",
    "safesign",
    "gclib",
    "nacencomm",
    "savis",
    "softdreams",
    "winca",
    "newca",
    "ksign",
];

/// Folder-name markers under Program Files whose whole subtree is scanned deeply.
/// Verbatim from `_VENDOR_DIR_MARKERS` in pkcs11_discovery.py.
pub const VENDOR_DIR_MARKERS: &[&str] = &[
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
    "feitian",
    "watchdata",
    "gemalto",
    "thales",
    "nacencomm",
    "savis",
    "softdreams",
    "winca",
    "newca",
    "ksign",
    "opensc",
];

/// Preferred Viettel modules, newest first (`_PREFERRED_VIETTEL_DLLS`).
pub const PREFERRED_VIETTEL_DLLS: &[&str] = &[
    r"C:\Windows\System32\viettel-ca_v6.dll",
    r"C:\Windows\System32\viettel-ca_v5.dll",
    r"C:\Windows\System32\viettel-ca_v4.dll",
    r"C:\Windows\System32\viettel-ca_v3.dll",
    r"C:\Windows\System32\viettel-ca_v2.dll",
    r"C:\Windows\System32\viettel-ca_v1.dll",
    r"C:\Windows\System32\viettel-ca.dll",
];

pub const WINDOWS_SCAN_DIRS: &[&str] = &[
    r"C:\Windows\System32",
    r"C:\Program Files",
    r"C:\Program Files (x86)",
];
const MAX_SCAN_DEPTH: usize = 2;
const MAX_SCAN_DEPTH_VENDOR: usize = 8;

/// Explicit well-known paths outside the WPF heuristics. Probed only if the file exists and
/// exports C_GetFunctionList. `verified` = confirmed on a real machine by the team.
pub struct KnownModule {
    pub vendor: &'static str,
    pub path: &'static str,
    pub verified: bool,
}

pub const KNOWN_WINDOWS: &[KnownModule] = &[
    KnownModule {
        vendor: "SafeNet/Thales eToken",
        path: r"C:\Windows\System32\eTPKCS11.dll",
        verified: false,
    },
    KnownModule {
        vendor: "Feitian ePass2003",
        path: r"C:\Windows\System32\eps2003csp11.dll",
        verified: false,
    },
    KnownModule {
        vendor: "OpenSC",
        path: r"C:\Program Files\OpenSC Project\OpenSC\pkcs11\opensc-pkcs11.dll",
        verified: false,
    },
    KnownModule {
        vendor: "SoftHSM2 (test)",
        path: r"C:\SoftHSM2\lib\softhsm2-x64.dll",
        verified: false,
    },
];

pub const KNOWN_MACOS: &[KnownModule] = &[
    KnownModule {
        vendor: "OpenSC",
        path: "/Library/OpenSC/lib/opensc-pkcs11.so",
        verified: false,
    },
    KnownModule {
        vendor: "SafeNet/Thales eToken",
        path: "/usr/local/lib/libeTPkcs11.dylib",
        verified: false,
    },
    KnownModule {
        vendor: "Feitian ePass2003",
        path: "/usr/local/lib/libcastle.1.0.0.dylib",
        verified: false,
    },
    KnownModule {
        vendor: "SoftHSM2 (Homebrew, test)",
        path: "/opt/homebrew/lib/softhsm/libsofthsm2.so",
        verified: false,
    },
    KnownModule {
        vendor: "SoftHSM2 (Homebrew Intel, test)",
        path: "/usr/local/lib/softhsm/libsofthsm2.so",
        verified: false,
    },
];

pub const KNOWN_LINUX: &[KnownModule] = &[
    KnownModule {
        vendor: "SoftHSM2 (test)",
        path: "/usr/lib/softhsm/libsofthsm2.so",
        verified: true,
    },
    KnownModule {
        vendor: "SoftHSM2 (test)",
        path: "/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so",
        verified: false,
    },
    KnownModule {
        vendor: "OpenSC",
        path: "/usr/lib/x86_64-linux-gnu/opensc-pkcs11.so",
        verified: false,
    },
];

/// macOS roots scanned with the same patterns (vendor apps usually drop a dylib here).
pub const MACOS_SCAN_DIRS: &[&str] = &[
    "/usr/local/lib",
    "/opt/homebrew/lib",
    "/Library",
    "/Applications",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    UserSpecified,
    EnvVar,
    PreferredViettel,
    Known,
    Scan,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleCandidate {
    pub path: PathBuf,
    pub vendor: Option<String>,
    pub source: Source,
}

fn matches_heuristic(name: &str) -> bool {
    let lower = name.to_lowercase();
    DLL_PATTERNS.iter().any(|p| lower.contains(p))
}

fn is_vendor_dir(name: &str) -> bool {
    let lower = name.to_lowercase();
    VENDOR_DIR_MARKERS.iter().any(|m| lower.contains(m))
}

fn has_module_extension(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());
    match std::env::consts::OS {
        "windows" => ext.as_deref() == Some("dll"),
        "macos" => matches!(ext.as_deref(), Some("dylib") | Some("so")),
        _ => ext.as_deref() == Some("so") || path.to_string_lossy().contains(".so."),
    }
}

/// True when the library loads and exports `C_GetFunctionList` (PKCS#11 entry point).
pub fn is_pkcs11_module(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    // SAFETY: loading a vendor library runs its initializers; this mirrors ctypes.CDLL in the
    // Python core and only happens for files that matched the vendor name heuristics.
    unsafe {
        match libloading::Library::new(path) {
            Ok(lib) => lib
                .get::<unsafe extern "C" fn()>(b"C_GetFunctionList\0")
                .is_ok(),
            Err(_) => false,
        }
    }
}

/// Port of `_iter_dlls`: recursive scan, deeper under vendor folders.
fn scan_dir(base: &Path, depth: usize, in_vendor: bool, out: &mut Vec<PathBuf>) {
    let max_depth = if in_vendor {
        MAX_SCAN_DEPTH_VENDOR
    } else {
        MAX_SCAN_DEPTH
    };
    if depth > max_depth {
        return;
    }
    let Ok(entries) = std::fs::read_dir(base) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() && depth < max_depth {
            let child_vendor = in_vendor || is_vendor_dir(&name);
            if depth == 0 || matches_heuristic(&name) || in_vendor {
                scan_dir(&path, depth + 1, child_vendor, out);
            }
        } else if (ft.is_file() || ft.is_symlink())
            && has_module_extension(&path)
            && matches_heuristic(&name)
        {
            out.push(path);
        }
    }
}

fn viettel_version(p: &Path) -> i64 {
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    name.find("_v")
        .and_then(|i| {
            name[i + 2..]
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse()
                .ok()
        })
        .unwrap_or(-1)
}

fn norm(p: &Path) -> String {
    std::fs::canonicalize(p)
        .unwrap_or_else(|_| p.to_path_buf())
        .to_string_lossy()
        .to_lowercase()
}

/// Port of `_pick_pkcs11_dll` + `ordered_pkcs11_dll_candidates`: primary first, rest sorted by path.
pub fn order_candidates(mut found: Vec<PathBuf>) -> Vec<PathBuf> {
    if found.len() <= 1 {
        return found;
    }
    found.sort_by_key(|p| p.to_string_lossy().to_lowercase());
    let preferred = PREFERRED_VIETTEL_DLLS
        .iter()
        .find_map(|pref| found.iter().position(|p| norm(p) == norm(Path::new(pref))));
    let primary_idx = preferred.or_else(|| {
        let viettel: Vec<usize> = (0..found.len())
            .filter(|i| norm(&found[*i]).contains("viettel"))
            .collect();
        viettel.into_iter().max_by_key(|i| {
            (
                viettel_version(&found[*i]),
                found[*i]
                    .file_name()
                    .map(|n| n.to_string_lossy().to_lowercase()),
            )
        })
    });
    let primary = found.remove(primary_idx.unwrap_or(0));
    std::iter::once(primary).chain(found).collect()
}

pub fn vendor_for(path: &Path) -> Option<String> {
    let s = path.to_string_lossy().to_lowercase();
    let table: &[(&str, &str)] = &[
        ("viettel", "Viettel-CA"),
        ("vnpt", "VNPT-CA"),
        ("bkav", "BKAV-CA"),
        ("fpt", "FPT-CA"),
        ("newtel", "NEWTEL-CA"),
        ("newca", "NEWTEL-CA"),
        ("nacencomm", "CA2 (Nacencomm)"),
        ("ca2", "CA2 (Nacencomm)"),
        ("easyca", "EasyCA (SoftDreams)"),
        ("softdreams", "EasyCA (SoftDreams)"),
        ("smartsign", "SmartSign (VNPT-SmartCA)"),
        ("misa", "MISA-CA"),
        ("efy", "EFY-CA"),
        ("trustca", "TrustCA (SAVIS)"),
        ("savis", "TrustCA (SAVIS)"),
        ("cmc", "CMC-CA"),
        ("oneca", "One-CA"),
        ("one-ca", "One-CA"),
        ("winca", "WinCA"),
        ("ksign", "K-Sign"),
        ("etpkcs11", "SafeNet/Thales eToken"),
        ("safenet", "SafeNet/Thales eToken"),
        ("eps2003", "Feitian ePass2003"),
        ("castle", "Feitian"),
        ("ngp11", "Feitian"),
        ("ftsafe", "Feitian"),
        ("watchdata", "Watchdata"),
        ("wdpkcs", "Watchdata"),
        ("idprime", "Thales IDPrime"),
        ("gclib", "Gemalto"),
        ("opensc", "OpenSC"),
        ("softhsm", "SoftHSM2 (test)"),
    ];
    table
        .iter()
        .find(|(k, _)| s.contains(k))
        .map(|(_, v)| v.to_string())
}

fn known_for_os() -> &'static [KnownModule] {
    match std::env::consts::OS {
        "windows" => KNOWN_WINDOWS,
        "macos" => KNOWN_MACOS,
        _ => KNOWN_LINUX,
    }
}

/// All usable modules, best first: user path, `PKCS11_DLL`/`PDFSIGN_PKCS11_MODULE` env,
/// then the WPF-equivalent scan (Viettel first), then explicit known paths.
pub fn discover(user: Option<&Path>) -> Vec<ModuleCandidate> {
    let mut out: Vec<ModuleCandidate> = Vec::new();
    let mut seen = HashSet::new();
    let mut push = |path: PathBuf, source: Source, out: &mut Vec<ModuleCandidate>| {
        if seen.insert(norm(&path)) && is_pkcs11_module(&path) {
            out.push(ModuleCandidate {
                vendor: vendor_for(&path),
                path,
                source,
            });
        }
    };
    if let Some(p) = user {
        push(p.to_path_buf(), Source::UserSpecified, &mut out);
    }
    for var in ["PDFSIGN_PKCS11_MODULE", "PKCS11_DLL"] {
        if let Some(v) = std::env::var_os(var) {
            push(PathBuf::from(v), Source::EnvVar, &mut out);
        }
    }
    let roots: &[&str] = match std::env::consts::OS {
        "windows" => WINDOWS_SCAN_DIRS,
        "macos" => MACOS_SCAN_DIRS,
        _ => &[],
    };
    let mut scanned = Vec::new();
    for root in roots {
        scan_dir(Path::new(root), 0, false, &mut scanned);
    }
    for path in order_candidates(scanned) {
        let src = if PREFERRED_VIETTEL_DLLS
            .iter()
            .any(|p| norm(Path::new(p)) == norm(&path))
        {
            Source::PreferredViettel
        } else {
            Source::Scan
        };
        push(path, src, &mut out);
    }
    for k in known_for_os() {
        push(PathBuf::from(k.path), Source::Known, &mut out);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heuristics_match_python() {
        assert!(matches_heuristic("viettel-ca_v6.dll"));
        assert!(matches_heuristic("VNPT-CA_csp11.dll"));
        assert!(matches_heuristic("BkavCA.dll"));
        assert!(!matches_heuristic("kernel32.dll"));
        assert!(is_vendor_dir("Viettel-CA Token Manager"));
    }

    #[test]
    fn viettel_highest_version_first() {
        let ordered = order_candidates(vec![
            PathBuf::from("/x/aaa-pkcs11.so"),
            PathBuf::from("/x/viettel-ca_v3.so"),
            PathBuf::from("/x/viettel-ca_v5.so"),
            PathBuf::from("/x/bkav_pkcs11.so"),
        ]);
        assert_eq!(ordered[0], PathBuf::from("/x/viettel-ca_v5.so"));
        assert_eq!(ordered[1], PathBuf::from("/x/aaa-pkcs11.so"));
    }

    #[test]
    fn no_viettel_falls_back_to_sorted() {
        let ordered = order_candidates(vec![
            PathBuf::from("/x/zz-pkcs11.so"),
            PathBuf::from("/x/bkav.so"),
        ]);
        assert_eq!(ordered[0], PathBuf::from("/x/bkav.so"));
    }
}
