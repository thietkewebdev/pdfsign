use anyhow::{anyhow, bail, Context, Result};
use clap::{Args, Parser, Subcommand};
use pdfsign_app::jobs::{run_job, OutputSpec, Placement, SignJob};
use pdfsign_app::remote::run_remote_job_with_api;
use pdfsign_app::settings::{config_dir, Settings};
use pdfsign_app::templates::TemplateStore;
use pdfsign_app::verify_view::verify_file;
use pdfsign_core::ltv::UreqHttp;
use pdfsign_core::soft::{certs_from_pem_or_der, SoftSigner};
use pdfsign_core::tsa::HttpTimestamper;
use pdfsign_core::{PadesLevel, RawSigner, StampTemplate, Timestamper};
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
    /// Sign one or many PDFs, with one or many signature boxes each.
    Sign(Box<SignArgs>),
    /// Verify every signature: integrity, signer, time, chain, timestamp, LTV.
    Verify {
        file: PathBuf,
        /// Trusted root certificate(s), PEM or DER.
        #[arg(long)]
        trust: Vec<PathBuf>,
        #[arg(long)]
        json: bool,
    },
    /// List saved signature templates (shared with the GUI).
    Templates {
        #[arg(long)]
        json: bool,
    },
    /// Sign a cloud job from a `pdfsign://v1/sign?t=...` deep link (protocol v1).
    WebSign(Box<WebSignArgs>),
}

#[derive(Args)]
struct WebSignArgs {
    /// Deep link from the web app (`pdfsign://v1/sign?t=...`).
    #[arg(long = "deep-link")]
    deep_link: String,
    #[command(flatten)]
    token: TokenArgs,
    #[command(flatten)]
    pin: PinArgs,
    #[arg(long, default_value = "0")]
    cert: CertSelector,
    #[arg(long, default_value = "B-B")]
    level: PadesLevel,
    #[arg(long)]
    tsa: Option<String>,
    #[arg(long, default_value = "default")]
    template: String,
    #[arg(long, requires = "soft_cert", conflicts_with_all = ["module", "pin_prompt", "pin_stdin"])]
    soft_key: Option<PathBuf>,
    #[arg(long)]
    soft_cert: Option<PathBuf>,
    #[arg(long)]
    soft_chain: Option<PathBuf>,
    #[arg(long)]
    json: bool,
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
    /// Input PDF(s). Several files = batch with the same boxes and template.
    #[arg(required = true)]
    inputs: Vec<PathBuf>,
    /// Output file (single input only).
    #[arg(long = "out", conflicts_with = "out_dir")]
    output: Option<PathBuf>,
    /// Output folder for batch signing (default: next to each input).
    #[arg(long)]
    out_dir: Option<PathBuf>,
    /// Suffix added to output names in folder mode.
    #[arg(long, default_value = "-da-ky", allow_hyphen_values = true)]
    suffix: String,
    /// Overwrite existing outputs instead of adding " (2)".
    #[arg(long)]
    overwrite: bool,
    #[command(flatten)]
    token: TokenArgs,
    #[command(flatten)]
    pin: PinArgs,
    /// Certificate index from list-certs, or serial:<HEX>.
    #[arg(long, default_value = "0")]
    cert: CertSelector,
    /// Signature box PAGE:x,y,w,h (PAGE = number or LAST; fractions of the displayed page,
    /// bottom-left origin). Repeat for several signatures on the same file.
    #[arg(long = "box", value_parser = parse_box)]
    boxes: Vec<Placement>,
    /// Invisible signature (no box).
    #[arg(long, conflicts_with = "boxes")]
    invisible: bool,
    /// PAdES level: B-B, B-T, B-LT, B-LTA.
    #[arg(long, default_value = "B-B")]
    level: PadesLevel,
    /// RFC 3161 TSA URL (required for B-T and above).
    #[arg(long)]
    tsa: Option<String>,
    /// Saved template id (see `templates`), or default.
    #[arg(long, default_value = "default")]
    template: String,
    /// Template JSON file (overrides --template).
    #[arg(long)]
    template_file: Option<PathBuf>,
    /// Seal image (PNG/JPEG), overrides the template's.
    #[arg(long)]
    seal_image: Option<PathBuf>,
    /// Handwritten signature image (PNG/JPEG), overrides the template's.
    #[arg(long)]
    signature_image: Option<PathBuf>,
    /// TrueType font for the stamp (default: bundled Noto Sans).
    #[arg(long)]
    font: Option<PathBuf>,
    #[arg(long)]
    reason: Option<String>,
    #[arg(long)]
    location: Option<String>,
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

fn parse_box(s: &str) -> std::result::Result<Placement, String> {
    let (page, rect) = s.split_once(':').ok_or("box must be PAGE:x,y,w,h")?;
    let page = if page.eq_ignore_ascii_case("last") {
        0
    } else {
        page.parse::<u32>()
            .map_err(|_| format!("bad page {page}"))?
    };
    let r: pdfsign_core::RectPct = rect.parse()?;
    Ok(Placement {
        page,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
    })
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

fn cmd_web_sign(a: WebSignArgs) -> Result<()> {
    let store = TemplateStore::new(&config_dir());
    let template = store
        .get(&a.template)
        .ok_or_else(|| anyhow!("template {} not found", a.template))?;
    let appearance = store.appearance(&template)?;
    let tsa = a.tsa.as_ref().map(|u| HttpTimestamper::new(u.clone()));
    let http = UreqHttp::default();

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
        let pin = read_pin(&a.pin, true)?.expect("PIN required");
        Box::new(module.signer(a.token.slot, &pin, &a.cert)?)
    };

    let default_api = Settings::load(&config_dir()).web_api_base;
    let url = run_remote_job_with_api(
        &a.deep_link,
        Some(default_api.as_str()),
        &appearance,
        signer.as_mut(),
        a.level,
        tsa.as_ref().map(|t| t as &dyn Timestamper),
        Some(&http),
    )?;
    if a.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({ "ok": true, "signedDownloadUrl": url }))?
        );
    } else {
        println!("OK web-sign -> {url}");
    }
    Ok(())
}

fn cmd_sign(a: SignArgs) -> Result<()> {
    if a.output.is_some() && a.inputs.len() > 1 {
        bail!("--out only works with one input; use --out-dir for batch signing");
    }
    let store = TemplateStore::new(&config_dir());
    let template: StampTemplate = match &a.template_file {
        Some(f) => serde_json::from_slice(&std::fs::read(f)?).context("reading --template-file")?,
        None => store
            .get(&a.template)
            .ok_or_else(|| anyhow!("template {} not found", a.template))?,
    };
    let mut appearance = store.appearance(&template)?;
    if let Some(p) = &a.seal_image {
        appearance.image = Some(std::fs::read(p).context("reading --seal-image")?);
    }
    if let Some(p) = &a.signature_image {
        appearance.signature_image = Some(std::fs::read(p).context("reading --signature-image")?);
    }
    if let Some(p) = &a.font {
        appearance.font = Some(std::fs::read(p).context("reading --font")?);
    }
    let placements = if a.invisible {
        Vec::new()
    } else if a.boxes.is_empty() {
        vec![Placement {
            page: 0,
            x: 0.64,
            y: 0.06,
            w: 0.32,
            h: 0.10,
        }]
    } else {
        a.boxes.clone()
    };
    let job = SignJob {
        inputs: a.inputs.clone(),
        output: match &a.output {
            Some(path) => OutputSpec::File { path: path.clone() },
            None => OutputSpec::Folder {
                dir: a.out_dir.clone(),
                suffix: a.suffix.clone(),
            },
        },
        placements,
        level: a.level,
        tsa_url: a.tsa.clone(),
        reason: a.reason.clone(),
        location: a.location.clone(),
        overwrite: a.overwrite,
    };
    let tsa = a.tsa.as_ref().map(|u| HttpTimestamper::new(u.clone()));
    let http = UreqHttp::default();

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
        let s = module.signer(a.token.slot, &pin, &a.cert)?;
        tracing::info!(mechanism = ?s.mechanism(), "token signer ready");
        Box::new(s)
    };

    let results = run_job(
        &job,
        &appearance,
        signer.as_mut(),
        tsa.as_ref().map(|t| t as &dyn Timestamper),
        Some(&http),
        |done, total, current| {
            if total > 1 && done < total && !a.json {
                eprintln!("[{}/{}] {}", done + 1, total, current.display());
            }
        },
    );
    let failed = results.iter().filter(|r| !r.ok).count();
    if a.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({ "ok": failed == 0, "results": results }))?
        );
    } else {
        for r in &results {
            match (&r.output, &r.error) {
                (Some(out), None) => println!(
                    "OK {} -> {} ({}, {} chữ ký)",
                    r.input.display(),
                    out.display(),
                    r.level.as_deref().unwrap_or("?"),
                    r.signatures
                ),
                (_, Some(e)) => println!("LỖI {}: {e}", r.input.display()),
                _ => {}
            }
            for w in &r.warnings {
                println!("  cảnh báo: {w}");
            }
        }
    }
    if failed > 0 {
        if let Some(code) = results
            .iter()
            .filter_map(|r| r.error.as_deref())
            .find_map(code_from_signer_message)
        {
            bail!(TokenError::new(code, "signing failed"));
        }
        bail!("{failed}/{} file ký thất bại", results.len());
    }
    Ok(())
}

fn cmd_verify(file: &Path, trust: &[PathBuf], as_json: bool) -> Result<bool> {
    let views = verify_file(file, trust)?;
    let all_ok = !views.is_empty() && views.iter().all(|v| v.integrity && v.verdict != "invalid");
    if as_json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({ "ok": all_ok, "signatures": views }))?
        );
        return Ok(all_ok);
    }
    if views.is_empty() {
        println!("Không có chữ ký trong file.");
    }
    for v in &views {
        println!(
            "{} [{}] {} | {} | tính toàn vẹn {} | mức {} | LTV {} | ký lúc {} | dấu thời gian {}",
            v.field,
            v.verdict,
            v.sub_filter,
            v.signer.as_deref().unwrap_or("?"),
            ok(v.integrity),
            v.level,
            ok(v.ltv),
            v.claimed_time.as_deref().unwrap_or("-"),
            v.timestamp_time.as_deref().unwrap_or("-"),
        );
        for n in &v.notes {
            println!("    - {n}");
        }
    }
    Ok(all_ok)
}

fn cmd_templates(as_json: bool) -> Result<()> {
    let list = TemplateStore::new(&config_dir()).list();
    if as_json {
        println!("{}", serde_json::to_string_pretty(&list)?);
    } else {
        for t in list {
            println!("{}\t{}\t{}", t.id, t.name, t.lines.join(" | "));
        }
    }
    Ok(())
}

/// Token failures during C_Sign arrive as "...CODE: detail" strings through `RawSigner`.
fn code_from_signer_message(msg: &str) -> Option<ErrorCode> {
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
    .find(|c| msg.contains(c.as_str()))
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
        Command::WebSign(args) => cmd_web_sign(*args),
        Command::Templates { json } => cmd_templates(json),
        Command::Verify { file, trust, json } => match cmd_verify(&file, &trust, json) {
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
                (None, None) => code_from_signer_message(&e.to_string()),
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
