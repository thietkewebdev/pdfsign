//! Identify inserted tokens through PC/SC (WinSCard) without loading any PKCS#11 driver.
//!
//! When a CA installs its token software it registers the card's ATR under a card name with
//! its CSP (HKLM\SOFTWARE\Microsoft\Cryptography\Calais\SmartCards), e.g. card
//! "EASYCA Token v1.0" → CSP "EASYCA Token CSP v1.0". Reading the reader list, each card's ATR
//! and that registration takes milliseconds, while scanning disks and loading every candidate
//! driver takes seconds. The USB vendor (often Feitian for several CAs) does not identify the
//! CA, the registered card name does.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PresentCard {
    /// PC/SC reader name, e.g. "FT ePass2003Auto 0" (hardware model).
    pub reader: String,
    /// Card name registered for this ATR by the CA software, e.g. "EASYCA Token v1.0".
    pub card: Option<String>,
    /// CSP registered for that card, e.g. "EASYCA Token CSP v1.0".
    pub csp: Option<String>,
    /// ATR, upper-case hex.
    pub atr: String,
}

impl PresentCard {
    /// Short label for UI and support reports.
    pub fn label(&self) -> String {
        match &self.card {
            Some(card) => format!("{card} ({})", self.reader),
            None => format!("{} (thẻ chưa đăng ký tên)", self.reader),
        }
    }
}

/// Cards currently inserted. Empty when PC/SC is unavailable (non-Windows, service stopped).
pub fn present_cards() -> Vec<PresentCard> {
    imp::present_cards()
}

/// PKCS#11 file names (System32) for a card, best first, from its registered card name / CSP.
/// Empty when the vendor is not mapped yet: the caller then falls back to a full scan.
pub fn module_hints(card: &PresentCard) -> &'static [&'static str] {
    let key = format!(
        "{} {}",
        card.card.as_deref().unwrap_or(""),
        card.csp.as_deref().unwrap_or("")
    )
    .to_lowercase();
    if key.contains("easyca") {
        &["easyca_csp11_v1.dll"]
    } else if key.contains("viettel") && key.contains("v6") {
        &["viettel-ca_v6.dll", "viettel-ca_v5.dll"]
    } else if key.contains("viettel") && key.contains("v5") {
        &["viettel-ca_v5.dll", "viettel-ca_v6.dll"]
    } else if key.contains("viettel") {
        &[
            "viettel-ca_v6.dll",
            "viettel-ca_v5.dll",
            "viettel-ca_v4.dll",
            "viettel-ca.dll",
        ]
    } else {
        &[]
    }
}

#[cfg(windows)]
mod imp {
    use super::PresentCard;
    use windows_sys::Win32::Security::Credentials::{
        SCardEstablishContext, SCardGetCardTypeProviderNameW, SCardGetStatusChangeW,
        SCardListCardsW, SCardListReadersW, SCardReleaseContext, SCARD_READERSTATEW,
        SCARD_SCOPE_USER, SCARD_STATE_PRESENT, SCARD_STATE_UNAWARE,
    };

    const SCARD_PROVIDER_CSP: u32 = 2;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Split a double-NUL-terminated UTF-16 multi-string.
    fn multi_string(buf: &[u16]) -> Vec<String> {
        buf.split(|&c| c == 0)
            .filter(|s| !s.is_empty())
            .map(String::from_utf16_lossy)
            .collect()
    }

    /// Two-call pattern: ask for the length, then fill the buffer.
    fn read_wide(mut call: impl FnMut(*mut u16, *mut u32) -> i32) -> Option<Vec<u16>> {
        let mut len: u32 = 0;
        if call(std::ptr::null_mut(), &mut len) != 0 || len == 0 {
            return None;
        }
        let mut buf = vec![0u16; len as usize];
        if call(buf.as_mut_ptr(), &mut len) != 0 {
            return None;
        }
        buf.truncate(len as usize);
        Some(buf)
    }

    pub fn present_cards() -> Vec<PresentCard> {
        let mut ctx: usize = 0;
        // SAFETY: Win32 smart-card API; every buffer passed outlives its call, reader-state
        // pointers reference `names` which lives until the end of this function, and the
        // context is released exactly once.
        unsafe {
            if SCardEstablishContext(
                SCARD_SCOPE_USER,
                std::ptr::null(),
                std::ptr::null(),
                &mut ctx,
            ) != 0
            {
                return Vec::new();
            }
            let readers =
                read_wide(|buf, len| SCardListReadersW(ctx, std::ptr::null(), buf, len) as i32)
                    .map(|b| multi_string(&b))
                    .unwrap_or_default();
            let names: Vec<Vec<u16>> = readers.iter().map(|r| wide(r)).collect();
            let mut states: Vec<SCARD_READERSTATEW> = names
                .iter()
                .map(|n| {
                    let mut s: SCARD_READERSTATEW = std::mem::zeroed();
                    s.szReader = n.as_ptr();
                    s.dwCurrentState = SCARD_STATE_UNAWARE;
                    s
                })
                .collect();
            let mut out = Vec::new();
            if !states.is_empty()
                && SCardGetStatusChangeW(ctx, 0, states.as_mut_ptr(), states.len() as u32) == 0
            {
                for (reader, st) in readers.iter().zip(states.iter()) {
                    if st.dwEventState & SCARD_STATE_PRESENT == 0 {
                        continue;
                    }
                    let atr = &st.rgbAtr[..(st.cbAtr as usize).min(st.rgbAtr.len())];
                    let card = read_wide(|buf, len| {
                        SCardListCardsW(ctx, atr.as_ptr(), std::ptr::null(), 0, buf, len) as i32
                    })
                    .and_then(|b| multi_string(&b).into_iter().next());
                    let csp = card.as_ref().and_then(|name| {
                        let w = wide(name);
                        read_wide(|buf, len| {
                            SCardGetCardTypeProviderNameW(
                                ctx,
                                w.as_ptr(),
                                SCARD_PROVIDER_CSP,
                                buf,
                                len,
                            ) as i32
                        })
                        .map(|b| {
                            String::from_utf16_lossy(&b)
                                .trim_end_matches('\0')
                                .to_string()
                        })
                        .filter(|s| !s.is_empty())
                    });
                    out.push(PresentCard {
                        reader: reader.clone(),
                        card,
                        csp,
                        atr: atr.iter().map(|b| format!("{b:02X}")).collect(),
                    });
                }
            }
            SCardReleaseContext(ctx);
            out
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn present_cards() -> Vec<super::PresentCard> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(name: &str, csp: &str) -> PresentCard {
        PresentCard {
            reader: "FT ePass2003Auto 0".into(),
            card: Some(name.into()),
            csp: Some(csp.into()),
            atr: String::new(),
        }
    }

    #[test]
    fn hints_from_registered_names() {
        assert_eq!(
            module_hints(&card("EASYCA Token v1.0", "EASYCA Token CSP v1.0")),
            &["easyca_csp11_v1.dll"]
        );
        assert_eq!(
            module_hints(&card("Viettel-CA V6.0", "Viettel Group CSP V6.0"))[0],
            "viettel-ca_v6.dll"
        );
        assert_eq!(
            module_hints(&card("Viettel-CA V5.0", "Viettel Group CSP V5.0"))[0],
            "viettel-ca_v5.dll"
        );
        assert!(module_hints(&card("Unknown Token", "Some CSP")).is_empty());
    }
}
