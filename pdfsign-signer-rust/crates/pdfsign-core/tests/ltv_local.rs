//! B-T / B-LT / B-LTA against `scripts/pki_services.py`. Skips unless `PDFSIGN_PKI_SERVICES=1`.

use pdfsign_core::ltv::UreqHttp;
use pdfsign_core::soft::SoftSigner;
use pdfsign_core::tsa::HttpTimestamper;
use pdfsign_core::{sign_at_level, verify_pdf_with, PadesLevel, SignOptions, VerifyOptions};
use std::path::PathBuf;

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures")
}

fn enabled() -> bool {
    std::env::var("PDFSIGN_PKI_SERVICES").as_deref() == Ok("1")
}

#[test]
fn levels_with_local_pki() {
    if !enabled() {
        eprintln!("PDFSIGN_PKI_SERVICES not set, skipping");
        return;
    }
    let pki = fixtures().join("pki-ltv");
    let key = std::fs::read_to_string(pki.join("signer.key.pem")).unwrap();
    let cert = std::fs::read(pki.join("signer.cert.pem")).unwrap();
    let ca = std::fs::read(pki.join("ca.cert.der")).unwrap();
    let input = std::fs::read(fixtures().join("sample.pdf")).unwrap();
    let tsa = HttpTimestamper::new("http://127.0.0.1:18080/tsa");
    let http = UreqHttp::default();
    let verify_opts = VerifyOptions { trust_anchors: vec![ca] };

    for (level, expected) in [
        (PadesLevel::BT, "B-T"),
        (PadesLevel::BLT, "B-LT"),
        (PadesLevel::BLTA, "B-LTA"),
    ] {
        // No chain from the "token": the CA must be fetched through AIA.
        let mut signer = SoftSigner::from_pem(&key, &cert, vec![]).unwrap();
        let out = sign_at_level(&input, &SignOptions::default(), &mut signer, level, Some(&tsa), Some(&http)).unwrap();
        assert_eq!(out.achieved, level, "warnings: {:?}", out.warnings);
        let reports = verify_pdf_with(&out.pdf, &verify_opts).unwrap();
        let sig = &reports[0];
        assert!(sig.is_intact(), "{sig:?}");
        assert_eq!(sig.level, expected, "{sig:?}");
        assert_eq!(sig.trusted, Some(true));
        assert!(sig.cert_valid_at_signing && sig.chain_complete && sig.chain_signatures_ok);
        if level >= PadesLevel::BLT {
            assert!(sig.ltv, "{:?}", sig.revocation);
            assert!(sig.revocation.iter().all(|r| r.status == "good"));
        }
        if level == PadesLevel::BLTA {
            assert!(reports.iter().any(|r| r.level == "DocTimeStamp" && r.timestamp_ok == Some(true)));
        }
        std::fs::write(std::env::temp_dir().join(format!("pdfsign-{expected}.pdf")), &out.pdf).unwrap();
    }
}
