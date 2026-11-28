//! complete_chain: pick the right issuer when two CA certificates share a subject name.
//! Fixtures (tests/data/chain): root → {ca_old, ca_new} (same subject "EASYCA test", different
//! keys) → ee issued by ca_new.

use pdfsign_core::complete_chain;

fn load(name: &str) -> Vec<u8> {
    std::fs::read(format!(
        "{}/tests/data/chain/{name}.der",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap()
}

#[test]
fn picks_issuer_by_signature_not_name() {
    let (root, old, new, ee) = (load("root"), load("ca_old"), load("ca_new"), load("ee"));
    // Same-name decoy first, leaf and duplicates in the pool must not matter.
    let pool = vec![old.clone(), ee.clone(), root.clone(), new.clone(), old];
    assert_eq!(complete_chain(&ee, &pool), vec![new, root]);
}

#[test]
fn stops_at_missing_link() {
    let (old, ee) = (load("ca_old"), load("ee"));
    assert!(complete_chain(&ee, &[old]).is_empty());
}

#[test]
fn intermediate_without_root() {
    let (new, ee) = (load("ca_new"), load("ee"));
    assert_eq!(complete_chain(&ee, std::slice::from_ref(&new)), vec![new]);
}
