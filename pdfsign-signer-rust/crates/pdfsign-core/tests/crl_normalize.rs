//! normalize_crl: PEM CRLs (as served by rootca.gov.vn) must be embedded as DER, and the
//! revocation status read from them. Fixtures: tests/data/crl (CA, two leaves, one revoked).

use pdfsign_core::cades::parse_certificate;
use pdfsign_core::ltv::normalize_crl;

fn load(name: &str) -> Vec<u8> {
    std::fs::read(format!(
        "{}/tests/data/crl/{name}",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap()
}

#[test]
fn pem_crl_becomes_der() {
    let leaf = parse_certificate(&load("leaf_ok.der")).unwrap();
    let (der, revoked) = normalize_crl(&load("crl.pem"), &leaf).unwrap();
    assert_eq!(der, load("crl.der"));
    assert!(!revoked);
}

#[test]
fn der_crl_passes_through_and_reports_revoked() {
    let leaf = parse_certificate(&load("leaf_revoked.der")).unwrap();
    let (der, revoked) = normalize_crl(&load("crl.der"), &leaf).unwrap();
    assert_eq!(der, load("crl.der"));
    assert!(revoked);
}

#[test]
fn rejects_garbage_and_foreign_issuer() {
    let leaf = parse_certificate(&load("leaf_ok.der")).unwrap();
    assert!(normalize_crl(b"<html>not found</html>", &leaf).is_err());
    // The CA certificate is self-issued by the same name, so use a cert from another CA.
    let other = parse_certificate(
        &std::fs::read(format!(
            "{}/tests/data/chain/ee.der",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap(),
    )
    .unwrap();
    assert!(normalize_crl(&load("crl.der"), &other).is_err());
}
