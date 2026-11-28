//! CA certificates from the operating system's certificate store.
//!
//! Vietnamese CA drivers install their intermediate and root certificates into the Windows
//! "CA" and "Root" stores, while the token itself usually holds only the end-entity certificate.
//! These certificates are used as a pool to complete the chain embedded in the signature; they
//! are never treated as trust anchors here.

/// DER certificates from the Windows CA and Root stores (current user and local machine).
/// Empty on other platforms or when a store cannot be opened.
pub fn system_ca_certs() -> Vec<Vec<u8>> {
    imp::system_ca_certs()
}

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::Security::Cryptography::{
        CertCloseStore, CertEnumCertificatesInStore, CertOpenStore, CERT_STORE_OPEN_EXISTING_FLAG,
        CERT_STORE_PROV_SYSTEM_W, CERT_STORE_READONLY_FLAG, CERT_SYSTEM_STORE_CURRENT_USER,
        CERT_SYSTEM_STORE_LOCAL_MACHINE,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn read_store(location: u32, name: &str, out: &mut Vec<Vec<u8>>) {
        let name = wide(name);
        let flags = location | CERT_STORE_READONLY_FLAG | CERT_STORE_OPEN_EXISTING_FLAG;
        // SAFETY: plain Win32 calls; `name` outlives the call, every context returned by
        // CertEnumCertificatesInStore is only read before the next call frees it, and the
        // store handle is closed exactly once.
        unsafe {
            let store = CertOpenStore(
                CERT_STORE_PROV_SYSTEM_W,
                0,
                0,
                flags,
                name.as_ptr() as *const core::ffi::c_void,
            );
            if store.is_null() {
                return;
            }
            let mut ctx = CertEnumCertificatesInStore(store, std::ptr::null());
            while !ctx.is_null() {
                let c = &*ctx;
                if !c.pbCertEncoded.is_null() && c.cbCertEncoded > 0 {
                    let der = std::slice::from_raw_parts(c.pbCertEncoded, c.cbCertEncoded as usize);
                    if !out.iter().any(|d| d.as_slice() == der) {
                        out.push(der.to_vec());
                    }
                }
                ctx = CertEnumCertificatesInStore(store, ctx);
            }
            CertCloseStore(store, 0);
        }
    }

    pub fn system_ca_certs() -> Vec<Vec<u8>> {
        let mut out = Vec::new();
        for location in [
            CERT_SYSTEM_STORE_CURRENT_USER,
            CERT_SYSTEM_STORE_LOCAL_MACHINE,
        ] {
            for store in ["CA", "Root"] {
                read_store(location, store, &mut out);
            }
        }
        out
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn system_ca_certs() -> Vec<Vec<u8>> {
        Vec::new()
    }
}
