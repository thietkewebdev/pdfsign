use pdfsign_core::soft::SoftSigner;
use pdfsign_core::{sign_pdf, verify_pdf, AppearanceOptions, PageSpec, RectPct, SignOptions};
use std::path::PathBuf;
use std::process::Command;

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures")
}

fn signer() -> SoftSigner {
    let dir = fixtures().join("pki");
    let key = std::fs::read_to_string(dir.join("signer.key.pem")).unwrap();
    let cert = std::fs::read(dir.join("signer.cert.pem")).unwrap();
    let ca = std::fs::read(dir.join("ca.cert.der")).unwrap();
    SoftSigner::from_pem(&key, &cert, vec![ca]).unwrap()
}

fn qpdf_check(bytes: &[u8], name: &str) {
    let path = std::env::temp_dir().join(format!("pdfsign-core-{name}.pdf"));
    std::fs::write(&path, bytes).unwrap();
    if let Ok(out) = Command::new("qpdf").arg("--check").arg(&path).output() {
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(
            out.status.success(),
            "qpdf --check failed for {name}: {stdout}"
        );
    }
}

fn sign_file(name: &str, opts: &SignOptions) -> Vec<u8> {
    let input = std::fs::read(fixtures().join(name)).unwrap();
    let out = sign_pdf(&input, opts, &mut signer(), None).unwrap();
    assert!(
        out.starts_with(&input),
        "incremental update must keep original bytes"
    );
    out
}

#[test]
fn signs_classic_xref_pdf() {
    let out = sign_file("sample.pdf", &SignOptions::default());
    let reports = verify_pdf(&out).unwrap();
    assert_eq!(reports.len(), 1);
    let r = &reports[0];
    assert!(r.is_intact(), "{r:?}");
    assert!(r.covers_whole_file);
    assert_eq!(r.sub_filter, "ETSI.CAdES.detached");
    assert!(r.has_signing_certificate_v2);
    assert!(!r.has_timestamp);
    assert_eq!(r.signer_cn.as_deref(), Some("Nguyễn Văn Thử"));
    qpdf_check(&out, "classic");
}

#[test]
fn signs_xref_stream_pdf() {
    let opts = SignOptions {
        page: PageSpec::Number(1),
        ..Default::default()
    };
    let out = sign_file("sample-xrefstream.pdf", &opts);
    let reports = verify_pdf(&out).unwrap();
    assert_eq!(reports.len(), 1);
    assert!(reports[0].is_intact() && reports[0].covers_whole_file);
    qpdf_check(&out, "xrefstream");
}

#[test]
fn signs_rotated_page_with_image() {
    let png = {
        let mut img = image::RgbaImage::new(64, 64);
        for (x, y, p) in img.enumerate_pixels_mut() {
            let d = ((x as i32 - 32).pow(2) + (y as i32 - 32).pow(2)) as f64;
            *p = if d < 900.0 {
                image::Rgba([220, 38, 38, 255])
            } else {
                image::Rgba([0, 0, 0, 0])
            };
        }
        let mut buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut buf, image::ImageFormat::Png).unwrap();
        buf.into_inner()
    };
    let opts = SignOptions {
        rect: RectPct {
            x: 0.55,
            y: 0.05,
            w: 0.4,
            h: 0.12,
        },
        appearance: AppearanceOptions {
            image: Some(png),
            ..Default::default()
        },
        ..Default::default()
    };
    let out = sign_file("sample-rotated.pdf", &opts);
    assert!(verify_pdf(&out).unwrap()[0].is_intact());
    qpdf_check(&out, "rotated");
}

#[test]
fn second_signature_keeps_first_valid() {
    let first = sign_file("sample.pdf", &SignOptions::default());
    let opts = SignOptions {
        rect: RectPct {
            x: 0.05,
            y: 0.06,
            w: 0.32,
            h: 0.10,
        },
        ..Default::default()
    };
    let second = sign_pdf(&first, &opts, &mut signer(), None).unwrap();
    let reports = verify_pdf(&second).unwrap();
    assert_eq!(reports.len(), 2);
    assert!(reports.iter().all(|r| r.is_intact()));
    assert!(!reports[0].covers_whole_file && reports[1].covers_whole_file);
    assert_eq!(reports[0].field_name, "Signature1");
    assert_eq!(reports[1].field_name, "Signature2");
    qpdf_check(&second, "double");
}

#[test]
fn tampering_is_detected() {
    let mut out = sign_file("sample.pdf", &SignOptions::default());
    let pos = out
        .windows(17)
        .position(|w| w == b"Hop dong mau so 1")
        .unwrap();
    out[pos] = b'X';
    let r = &verify_pdf(&out).unwrap()[0];
    assert!(!r.digest_ok);
}
