//! PKCS#11 round trip against SoftHSM2. Skips (passes) when softhsm2-util / pkcs11-tool are missing.

use pdfsign_core::{sign_pdf, verify_pdf, SignOptions};
use pdfsign_token::{pin_from_string, CertSelector, ErrorCode, Module};
use std::path::{Path, PathBuf};
use std::process::Command;

const MODULES: &[&str] = &[
    "/usr/lib/softhsm/libsofthsm2.so",
    "/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so",
    "/opt/homebrew/lib/softhsm/libsofthsm2.so",
    "/usr/local/lib/softhsm/libsofthsm2.so",
];

fn tool(name: &str) -> bool {
    Command::new(name).arg("--help").output().is_ok()
}

fn run(cmd: &mut Command) {
    let out = cmd.output().expect("spawn");
    assert!(
        out.status.success(),
        "{cmd:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn softhsm_list_and_sign() {
    let Some(module) = MODULES.iter().map(Path::new).find(|p| p.exists()) else {
        eprintln!("SoftHSM2 not installed, skipping");
        return;
    };
    if !tool("softhsm2-util") || !tool("pkcs11-tool") {
        eprintln!("softhsm2-util/pkcs11-tool missing, skipping");
        return;
    }
    let fixtures = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures");
    let pki = fixtures.join("pki");
    let dir = std::env::temp_dir().join(format!("pdfsign-softhsm-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let conf = dir.join("softhsm2.conf");
    std::fs::write(
        &conf,
        format!(
            "directories.tokendir = {}\nobjectstore.backend = file\n",
            dir.display()
        ),
    )
    .unwrap();
    // SoftHSM2 reads its config path from the environment of the loading process.
    std::env::set_var("SOFTHSM2_CONF", &conf);

    run(Command::new("softhsm2-util").args([
        "--init-token",
        "--free",
        "--label",
        "RT",
        "--pin",
        "1111",
        "--so-pin",
        "22222222",
    ]));
    run(Command::new("softhsm2-util")
        .args(["--import"])
        .arg(pki.join("signer.key.pem"))
        .args([
            "--token", "RT", "--label", "k", "--id", "0a00", "--pin", "1111",
        ]));
    run(Command::new("pkcs11-tool")
        .arg("--module")
        .arg(module)
        .args([
            "--token-label",
            "RT",
            "--login",
            "--pin",
            "1111",
            "--write-object",
        ])
        .arg(pki.join("signer.cert.der"))
        .args(["--type", "cert", "--id", "0a", "--label", "k"]));
    run(Command::new("pkcs11-tool")
        .arg("--module")
        .arg(module)
        .args([
            "--token-label",
            "RT",
            "--login",
            "--pin",
            "1111",
            "--write-object",
        ])
        .arg(pki.join("ca.cert.der"))
        .args(["--type", "cert", "--id", "02", "--label", "ca"]));

    let m = Module::load(module).unwrap();
    let slots = m.token_slots().unwrap();
    assert_eq!(slots.len(), 1);
    assert_eq!(slots[0].1.label, "RT");

    // Index order must not depend on C_FindObjects order: end-entity first, CA last,
    // identical with and without login.
    let certs = m.list_certs(0, None).unwrap();
    assert_eq!(certs.len(), 2);
    assert_eq!(
        certs[0].summary.subject_cn.as_deref(),
        Some("Nguyễn Văn Thử")
    );
    assert!(certs[1].summary.is_ca);
    let logged_in = m
        .list_certs(0, Some(&pin_from_string("1111".into())))
        .unwrap();
    assert_eq!(logged_in[0].summary.serial, certs[0].summary.serial);

    let ca = m.signer(0, &pin_from_string("1111".into()), &CertSelector::Index(1));
    assert_eq!(ca.err().map(|e| e.code), Some(ErrorCode::NoCerts));

    // Key CKA_ID 0a00 vs cert CKA_ID 0a: matched by trailing-NUL normalization like the Python core.
    let bad = m.signer(0, &pin_from_string("0000".into()), &CertSelector::Index(0));
    assert_eq!(bad.err().map(|e| e.code), Some(ErrorCode::PinIncorrect));

    let mut signer = m
        .signer(0, &pin_from_string("1111".into()), &CertSelector::Index(0))
        .unwrap();
    let input = std::fs::read(fixtures.join("sample.pdf")).unwrap();
    let out = sign_pdf(&input, &SignOptions::default(), &mut signer, None).unwrap();
    let report = &verify_pdf(&out).unwrap()[0];
    assert!(report.is_intact() && report.covers_whole_file);
    let _ = std::fs::remove_dir_all(&dir);
}
