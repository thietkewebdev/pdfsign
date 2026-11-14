use anyhow::{anyhow, bail, Context, Result};
use clap::{Args, Parser, Subcommand};
use pdfsign_core::soft::{certs_from_pem_or_der, SoftSigner};
use pdfsign_core::{
    sign_pdf, verify_pdf, AppearanceOptions, PageSpec, RawSigner, RectPct, SignOptions, Timestamper,
};
use pdfsign_token::{discover, AuthPin, CertSelector, ErrorCode, Module, TokenError};
use serde_json::json;
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

#[derive(Parser)]
#[command(
    name = "pdfsign",
    version,
    about = "PDFSign signer: PAdES signing with PKCS#11 USB tokens"
)]
struct Cli {
    /// Verbose logs on stderr (PINs are never logged).
    #[arg(short, long, global = true)]
    verbose: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// List PKCS#11 modules found on this machine and their token slots (no PIN needed).
    ListTokens {
        /// Extra module path to probe first.
        #[arg(long)]
        module: Option<PathBuf>,
        #[arg(long)]
        json: bool,
    },
    /// List certificates on a token.
    ListCerts {
        #[command(flatten)]
        token: TokenArgs,
        #[command(flatten)]
        pin: PinArgs,
        #[arg(long)]
        json: bool,
    },
    /// Sign a PDF (PAdES B-B, or B-T with --tsa).
    Sign(Box<SignArgs>),
    /// Check integrity + signature value of every signature in a PDF (not trust validation).
    Verify {
        file: PathBuf,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Args, Clone)]
struct TokenArgs {
    /// PKCS#11 module (DLL/dylib/so). Default: auto-discover like the WPF signer (Viettel first).
    #[arg(long)]
    module: Option<PathBuf>,
    /// Token slot index among slots with a token (see list-tokens).
    #[arg(long, default_value_t = 0)]
    slot: usize,
}

#[derive(Args, Clone)]
struct PinArgs {
    /// Ask for the PIN on the terminal with echo off.
    #[arg(long)]
    pin_prompt: bool,
    /// Read the PIN from the first line of stdin (automation/CI). Never pass a PIN in argv.
    #[arg(long, conflicts_with = "pin_prompt")]
    pin_stdin: bool,
}

#[derive(Args)]
struct SignArgs {
    #[arg(long = "in")]
    input: PathBuf,
    #[arg(long = "out")]
    output: PathBuf,
    #[command(flatten)]
    token: TokenArgs,
    #[command(flatten)]
    pin: PinArgs,
    /// Certificate index from list-certs, or serial:<HEX>.
    #[arg(long, default_value = "0")]
    cert: CertSelector,
    /// 1-based page number or LAST.
    #[arg(long, default_value = "LAST")]
    page: PageSpec,
    /// Box as x,y,w,h fractions of the displayed page, bottom-left origin (same as rectPct).
    #[arg(long, default_value = "0.64,0.06,0.32,0.10")]
    rect: RectPct,
    /// No visible appearance.
    #[arg(long)]
    invisible: bool,
    /// PNG/JPEG seal or handwritten signature image (seal layout).
    #[arg(long)]
    image: Option<PathBuf>,
    /// TrueType font for the stamp (default: bundled Noto Sans).
    #[arg(long)]
    font: Option<PathBuf>,
    /// Override the name on the stamp (default: subject O, else CN).
    #[arg(long)]
    signer_name: Option<String>,
    #[arg(long)]
    reason: Option<String>,
    #[arg(long)]
    location: Option<String>,
    #[arg(long)]
    field_name: Option<String>,
    /// RFC 3161 TSA URL; adds a signature timestamp (PAdES B-T).
    #[arg(long)]
    tsa: Option<String>,
    /// TEST ONLY: sign with a PKCS#8 PEM key instead of a token.
    #[arg(long, requires = "soft_cert", conflicts_with_all = ["module", "pin_prompt", "pin_stdin"])]
    soft_key: Option<PathBuf>,
    /// TEST ONLY: certificate (PEM/DER) for --soft-key.
    #[arg(long)]
    soft_cert: Option<PathBuf>,
    /// TEST ONLY: CA certificates (PEM) to embed with --soft-key.
    #[arg(long)]
    soft_chain: Option<PathBuf>,
    #[arg(long)]
    json: bool,
}

fn read_pin(args: &PinArgs, required: bool) -> Result<Option<AuthPin>> {
    let pin = if args.pin_stdin {
        let mut line = String::new();
        std::io::stdin()
            .lock()
            .read_line(&mut line)
            .context("reading PIN from stdin")?;
        Some(line.trim_end_matches(['\r', '\n']).to_string())
    } else if args.pin_prompt || required {
        Some(rpassword::prompt_password("PIN token: ").context("reading PIN")?)
    } else {
        None
    };
    match pin {
        Some(p) if p.is_empty() => bail!(TokenError::new(ErrorCode::PinInvalid, "empty PIN")),
        Some(p) => Ok(Some(pdfsign_token::pin_from_string(p))),
        None => Ok(None),
    }
}

/// Open the requested module, or the first discovered module that has a token
/// (same retry rule as `list_certs_try_pkcs11_dlls`).
fn open_module(token: &TokenArgs) -> Result<Module> {
    if let Some(m) = &token.module {
        return Ok(Module::load(m)?);
    }
    let candidates = discover(None);
    if candidates.is_empty() {
        bail!(TokenError::new(
            ErrorCode::NoPkcs11Dll,
            "no PKCS#11 module found; pass --module"
        ));
    }
    let mut last = None;
    for c in candidates {
        tracing::debug!(module = %c.path.display(), "trying module");
        match Module::load(&c.path) {
            Ok(m) => match m.token_slots() {
                Ok(slots) if !slots.is_empty() => return Ok(m),
                Ok(_) => {
                    last = Some(TokenError::new(
                        ErrorCode::TokenNotFound,
                        c.path.display().to_string(),
                    ))
                }
                Err(e) => last = Some(e),
            },
            Err(e) => last = Some(e),
        }
    }
    Err(last
        .unwrap_or_else(|| TokenError::new(ErrorCode::TokenNotFound, "no token"))
        .into())
}

fn cmd_list_tokens(module: Option<&Path>, as_json: bool) -> Result<()> {
    let mut rows = Vec::new();
    for c in discover(module) {
        let slots = Module::load(&c.path)
            .and_then(|m| m.token_slots())
            .map(|s| s.into_iter().map(|(_, s)| s).collect::<Vec<_>>());
        rows.push((c, slots));
    }
    if as_json {
        let out: Vec<_> = rows
            .iter()
            .map(|(c, slots)| match slots {
                Ok(s) => json!({ "module": c.path, "vendor": c.vendor, "source": c.source, "slots": s }),
                Err(e) => json!({ "module": c.path, "vendor": c.vendor, "source": c.source, "error": e.code.as_str() }),
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({ "found": !out.is_empty(), "modules": out }))?
        );
        return Ok(());
    }
    if rows.is_empty() {
        println!(
            "Không tìm thấy module PKCS#11 nào. Cài driver token hoặc dùng --module <đường dẫn>."
        );
    }
    for (c, slots) in rows {
        println!(
            "{} [{}] ({:?})",
            c.path.display(),
            c.vendor.as_deref().unwrap_or("?"),
            c.source
        );
        match slots {
            Ok(s) if s.is_empty() => println!("  (không có token)"),
            Ok(s) => s.iter().for_each(|s| {
                println!(
                    "  slot {}: {} | {} {} | serial {}",
                    s.index, s.label, s.manufacturer, s.model, s.serial
                )
            }),
            Err(e) => println!("  lỗi: {} {}", e.code.as_str(), e.detail),
        }
    }
    Ok(())
}

fn cmd_list_certs(token: &TokenArgs, pin: &PinArgs, as_json: bool) -> Result<()> {
    let pin = read_pin(pin, false)?;
    let module = open_module(token)?;
    let certs = module.list_certs(token.slot, pin.as_ref())?;
    if as_json {
        let list: Vec<_> = certs
            .iter()
            .map(|c| {
                json!({
                    "index": c.index,
                    "subjectO": c.summary.subject_o,
                    "subjectCN": c.summary.subject_cn,
                    "issuerCN": c.summary.issuer_cn,
                    "serial": c.summary.serial,
                    "validTo": c.summary.valid_to.format("%Y-%m-%d %H:%M").to_string(),
                    "displayName": c.summary.display_name(),
                    "label": c.label,
                })
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(
                &json!({ "dllPath": module.path(), "slot": token.slot, "certs": list })
            )?
        );
        return Ok(());
    }
    println!("Module: {}", module.path().display());
    let now = chrono::Utc::now();
    for c in certs {
        let s = &c.summary;
        println!(
            "[{}] {} | CN={} | CA={} | serial={} | hết hạn {}{}",
            c.index,
            s.display_name(),
            s.subject_cn.as_deref().unwrap_or("-"),
            s.issuer_cn.as_deref().unwrap_or("-"),
            s.serial,
            s.valid_to.format("%d-%m-%Y"),
            if s.is_time_valid(now) {
                ""
            } else {
                " (KHÔNG còn hiệu lực)"
            }
        );
    }
    Ok(())
}

fn cmd_sign(a: SignArgs) -> Result<()> {
    let input =
        std::fs::read(&a.input).with_context(|| format!("reading {}", a.input.display()))?;
    let appearance = AppearanceOptions {
        signer_name: a.signer_name.clone(),
        time_text: None,
        image: a
            .image
            .as_ref()
            .map(std::fs::read)
            .transpose()
            .context("reading --image")?,
        font: a
            .font
            .as_ref()
            .map(std::fs::read)
            .transpose()
            .context("reading --font")?,
    };
    let opts = SignOptions {
        page: a.page,
        rect: a.rect,
        invisible: a.invisible,
        field_name: a.field_name.clone(),
        reason: a.reason.clone(),
        location: a.location.clone(),
        appearance,
        ..Default::default()
    };
    #[cfg(feature = "tsa")]
    let tsa = a
        .tsa
        .as_ref()
        .map(|u| pdfsign_core::tsa::HttpTimestamper::new(u.clone()));
    #[cfg(not(feature = "tsa"))]
    let tsa: Option<NoTsa> = a.tsa.as_ref().map(|_| NoTsa);
    let tsa_ref = tsa.as_ref().map(|t| t as &dyn Timestamper);

    let mut signer: Box<dyn RawSigner> = if let Some(key) = &a.soft_key {
        let cert = std::fs::read(
            a.soft_cert
                .as_ref()
                .ok_or_else(|| anyhow!("--soft-cert required"))?,
        )?;
        let chain = match &a.soft_chain {
            Some(p) => certs_from_pem_or_der(&std::fs::read(p)?)?,
            None => Vec::new(),
        };
        Box::new(SoftSigner::from_pem(
            &std::fs::read_to_string(key)?,
            &cert,
            chain,
        )?)
    } else {
        let module = open_module(&a.token)?;
        let (_, slot) = module.slot(a.token.slot)?;
        if slot.pin_final_try {
            eprintln!("CẢNH BÁO: token chỉ còn 1 lần nhập PIN. Nhập sai sẽ KHÓA token.");
        } else if slot.pin_count_low {
            eprintln!("Cảnh báo: token báo đã có lần nhập sai PIN gần đây.");
        }
        let pin = read_pin(&a.pin, true)?.expect("PIN required");
        tracing::info!(module = %module.path().display(), slot = a.token.slot, "signing with token");
        Box::new(module.signer(a.token.slot, &pin, &a.cert)?)
    };

    let signed = sign_pdf(&input, &opts, signer.as_mut(), tsa_ref)?;
    let report = verify_pdf(&signed)?
        .into_iter()
        .find(|r| r.covers_whole_file)
        .ok_or_else(|| anyhow!("new signature not found after signing"))?;
    if !report.is_intact() {
        bail!("self-check failed after signing: {report:?}");
    }
    std::fs::write(&a.output, &signed)
        .with_context(|| format!("writing {}", a.output.display()))?;
    let summary = pdfsign_core::summarize(&signer.certificate_der())?;
    let level = if report.has_timestamp {
        "PAdES-B-T"
    } else {
        "PAdES-B-B"
    };
    if a.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "ok": true,
                "out": a.output,
                "fieldName": report.field_name,
                "level": level,
                "subjectO": summary.subject_o,
                "subjectCN": summary.subject_cn,
                "issuerCN": summary.issuer_cn,
                "serial": summary.serial,
                "signingTime": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            }))?
        );
    } else {
        println!(
            "OK {} -> {} ({}, field {})",
            a.input.display(),
            a.output.display(),
            level,
            report.field_name
        );
    }
    Ok(())
}

#[cfg(not(feature = "tsa"))]
struct NoTsa;
#[cfg(not(feature = "tsa"))]
impl Timestamper for NoTsa {
    fn timestamp(&self, _: &[u8; 32]) -> pdfsign_core::Result<Vec<u8>> {
        Err(pdfsign_core::Error::Tsa("built without TSA support".into()))
    }
}

fn cmd_verify(file: &Path, as_json: bool) -> Result<bool> {
    let data = std::fs::read(file)?;
    let reports = verify_pdf(&data)?;
    let all_ok = !reports.is_empty() && reports.iter().all(|r| r.is_intact());
    if as_json {
        let list: Vec<_> = reports
            .iter()
            .map(|r| {
                json!({
                    "field": r.field_name, "subFilter": r.sub_filter, "signerCN": r.signer_cn,
                    "byteRange": r.byte_range, "coversWholeFile": r.covers_whole_file,
                    "digestOk": r.digest_ok, "signatureOk": r.signature_ok,
                    "signingCertificateV2": r.has_signing_certificate_v2,
                    "cmsAlgorithmProtection": r.has_algorithm_protection,
                    "timestamp": r.has_timestamp, "signedAttributes": r.signed_attribute_oids,
                    "error": r.error,
                })
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({ "ok": all_ok, "signatures": list }))?
        );
    } else {
        if reports.is_empty() {
            println!("Không có chữ ký trong file.");
        }
        for r in &reports {
            if let Some(err) = &r.error {
                println!(
                    "{}: {} | không đọc được CMS: {err}",
                    r.field_name, r.sub_filter
                );
                continue;
            }
            println!(
                "{}: {} | {} | digest {} | chữ ký {} | phủ toàn file {} | TSA {}",
                r.field_name,
                r.sub_filter,
                r.signer_cn.as_deref().unwrap_or("?"),
                ok(r.digest_ok),
                ok(r.signature_ok),
                ok(r.covers_whole_file),
                ok(r.has_timestamp)
            );
        }
    }
    Ok(all_ok)
}

/// Token failures during C_Sign arrive as "CODE: detail" strings through `RawSigner`.
fn code_from_signer_message(msg: &str) -> Option<ErrorCode> {
    let code = msg.split(':').next()?;
    [
        ErrorCode::PinIncorrect,
        ErrorCode::PinLocked,
        ErrorCode::PinExpired,
        ErrorCode::PinInvalid,
        ErrorCode::TokenNotFound,
        ErrorCode::TokenRemoved,
        ErrorCode::UserCancelled,
        ErrorCode::DeviceError,
    ]
    .into_iter()
    .find(|c| c.as_str() == code)
}

fn ok(b: bool) -> &'static str {
    if b {
        "OK"
    } else {
        "KHÔNG"
    }
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let filter = if cli.verbose { "debug" } else { "warn" };
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_env("PDFSIGN_LOG")
                .unwrap_or_else(|_| filter.into()),
        )
        .init();

    let result = match cli.command {
        Command::ListTokens { module, json } => cmd_list_tokens(module.as_deref(), json),
        Command::ListCerts { token, pin, json } => cmd_list_certs(&token, &pin, json),
        Command::Sign(args) => cmd_sign(*args),
        Command::Verify { file, json } => match cmd_verify(&file, json) {
            Ok(true) => Ok(()),
            Ok(false) => return ExitCode::from(2),
            Err(e) => Err(e),
        },
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            let token_code = match (
                e.downcast_ref::<TokenError>(),
                e.downcast_ref::<pdfsign_core::Error>(),
            ) {
                (Some(te), _) => {
                    tracing::debug!(detail = %te.detail, "token error");
                    Some(te.code)
                }
                (None, Some(pdfsign_core::Error::Signer(msg))) => code_from_signer_message(msg),
                _ => None,
            };
            if let Some(code) = token_code {
                eprintln!("ERRCODE:{}", code.as_str());
                eprintln!("{}", code.message_vi());
            } else {
                eprintln!("{e:#}");
            }
            ExitCode::FAILURE
        }
    }
}
