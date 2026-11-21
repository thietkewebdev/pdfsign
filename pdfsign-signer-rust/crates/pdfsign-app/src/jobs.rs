//! Sign jobs: one or many PDFs (batch), one or many boxes per PDF (sequential signatures),
//! at a PAdES level. Used by the GUI and the CLI; web mode will build the same [`SignJob`].

use crate::{AppError, Result};
use pdfsign_core::ltv::{
    add_document_timestamp, add_dss, add_ltv_for_last_signature, certs_in_cms,
    collect_validation_data, signature_contents, Http,
};
use pdfsign_core::{
    sign_pdf, AppearanceOptions, PadesLevel, PageSpec, RawSigner, RectPct, SignOptions, Timestamper,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    /// 1-based page number; 0 means the last page.
    pub page: u32,
    /// Fractions of the displayed page, bottom-left origin (same as the cloud `rectPct`).
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Placement {
    fn page_spec(&self) -> PageSpec {
        if self.page == 0 {
            PageSpec::Last
        } else {
            PageSpec::Number(self.page)
        }
    }

    fn rect(&self) -> RectPct {
        RectPct {
            x: self.x,
            y: self.y,
            w: self.w,
            h: self.h,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum OutputSpec {
    /// Single input written to this exact path.
    File { path: PathBuf },
    /// Each input written to `dir` (or next to the input when `None`) as `<stem><suffix>.pdf`.
    Folder {
        dir: Option<PathBuf>,
        suffix: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignJob {
    pub inputs: Vec<PathBuf>,
    pub output: OutputSpec,
    /// Empty = one invisible signature.
    pub placements: Vec<Placement>,
    pub level: PadesLevel,
    pub tsa_url: Option<String>,
    pub reason: Option<String>,
    pub location: Option<String>,
    /// Overwrite existing output files (otherwise a numeric suffix is added).
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileResult {
    pub input: PathBuf,
    pub output: Option<PathBuf>,
    pub ok: bool,
    pub signatures: usize,
    pub level: Option<String>,
    pub warnings: Vec<String>,
    pub error: Option<String>,
}

pub fn output_path(spec: &OutputSpec, input: &Path, overwrite: bool) -> PathBuf {
    let path = match spec {
        OutputSpec::File { path } => return path.clone(),
        OutputSpec::Folder { dir, suffix } => {
            let stem = input
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "file".into());
            let dir = dir
                .clone()
                .unwrap_or_else(|| input.parent().map(Path::to_path_buf).unwrap_or_default());
            dir.join(format!("{stem}{suffix}.pdf"))
        }
    };
    if overwrite || !path.exists() {
        return path;
    }
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    (2..)
        .map(|n| path.with_file_name(format!("{stem} ({n}).pdf")))
        .find(|p| !p.exists())
        .expect("unbounded")
}

/// Sign one PDF in memory: one signature per placement, then LTV/LTA once for all of them.
pub fn sign_bytes(
    input: &[u8],
    job: &SignJob,
    appearance: &AppearanceOptions,
    signer: &mut dyn RawSigner,
    tsa: Option<&dyn Timestamper>,
    http: Option<&dyn Http>,
) -> Result<(Vec<u8>, PadesLevel, Vec<String>)> {
    if job.level >= PadesLevel::BT && tsa.is_none() {
        return Err(AppError::Other(format!(
            "{} cần chọn máy chủ TSA",
            job.level.as_str()
        )));
    }
    let sig_tsa = if job.level >= PadesLevel::BT {
        tsa
    } else {
        None
    };
    let base = SignOptions {
        reason: job.reason.clone().filter(|s| !s.trim().is_empty()),
        location: job.location.clone().filter(|s| !s.trim().is_empty()),
        appearance: appearance.clone(),
        ..Default::default()
    };
    let mut pdf = input.to_vec();
    let mut added = 0;
    if job.placements.is_empty() {
        pdf = sign_pdf(
            &pdf,
            &SignOptions {
                invisible: true,
                ..base.clone()
            },
            signer,
            sig_tsa,
        )?;
        added = 1;
    }
    for p in &job.placements {
        let opts = SignOptions {
            page: p.page_spec(),
            rect: p.rect(),
            ..base.clone()
        };
        pdf = sign_pdf(&pdf, &opts, signer, sig_tsa)?;
        added += 1;
    }
    let mut achieved = if job.level >= PadesLevel::BT {
        PadesLevel::BT
    } else {
        PadesLevel::BB
    };
    let mut warnings = Vec::new();
    if job.level < PadesLevel::BLT {
        return Ok((pdf, achieved, warnings));
    }

    let http = http.ok_or_else(|| AppError::Other("B-LT cần kết nối mạng".into()))?;
    let sigs = signature_contents(&pdf)?;
    let new_sigs = &sigs[sigs.len() - added..];
    let mut start = Vec::new();
    for (cms, _) in new_sigs {
        for c in certs_in_cms(cms)? {
            if !start.contains(&c) {
                start.push(c);
            }
        }
    }
    let data = collect_validation_data(&start, &signer.chain_der(), http);
    if !data.revoked.is_empty() {
        return Err(AppError::Other(format!(
            "chứng thư đã bị thu hồi: {}",
            data.revoked.join(", ")
        )));
    }
    let raws: Vec<Vec<u8>> = new_sigs.iter().map(|(_, raw)| raw.clone()).collect();
    pdf = add_dss(&pdf, &data, &raws)?;
    warnings.extend(data.warnings.iter().cloned());
    if data.warnings.is_empty() {
        achieved = PadesLevel::BLT;
    }
    if job.level == PadesLevel::BLTA {
        pdf = add_document_timestamp(&pdf, tsa.expect("checked"))?;
        let (with_dss, dts) = add_ltv_for_last_signature(&pdf, &signer.chain_der(), http)?;
        pdf = with_dss;
        warnings.extend(dts.warnings.iter().cloned());
        if achieved == PadesLevel::BLT && dts.warnings.is_empty() {
            achieved = PadesLevel::BLTA;
        }
    }
    Ok((pdf, achieved, warnings))
}

/// Run a job over all inputs. `progress(done, total, current)` is called before each file.
pub fn run_job(
    job: &SignJob,
    appearance: &AppearanceOptions,
    signer: &mut dyn RawSigner,
    tsa: Option<&dyn Timestamper>,
    http: Option<&dyn Http>,
    mut progress: impl FnMut(usize, usize, &Path),
) -> Vec<FileResult> {
    let total = job.inputs.len();
    let mut results = Vec::with_capacity(total);
    for (i, input) in job.inputs.iter().enumerate() {
        progress(i, total, input);
        let res = std::fs::read(input)
            .map_err(AppError::from)
            .and_then(|bytes| {
                let (pdf, level, warnings) =
                    sign_bytes(&bytes, job, appearance, signer, tsa, http)?;
                let out = output_path(&job.output, input, job.overwrite);
                if let Some(parent) = out.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(&out, &pdf)?;
                Ok((out, level, warnings))
            });
        results.push(match res {
            Ok((out, level, warnings)) => FileResult {
                input: input.clone(),
                output: Some(out),
                ok: true,
                signatures: job.placements.len().max(1),
                level: Some(level.as_str().into()),
                warnings,
                error: None,
            },
            Err(e) => FileResult {
                input: input.clone(),
                output: None,
                ok: false,
                signatures: 0,
                level: None,
                warnings: Vec::new(),
                error: Some(e.to_string()),
            },
        });
        // A token error (PIN, removed token) will fail every remaining file the same way.
        if let Some(err) = results.last().and_then(|r| r.error.as_deref()) {
            if ["PIN_", "TOKEN_", "DEVICE_ERROR"]
                .iter()
                .any(|p| err.contains(p))
            {
                for rest in &job.inputs[i + 1..] {
                    results.push(FileResult {
                        input: rest.clone(),
                        output: None,
                        ok: false,
                        signatures: 0,
                        level: None,
                        warnings: Vec::new(),
                        error: Some("bỏ qua do lỗi token ở file trước".into()),
                    });
                }
                break;
            }
        }
    }
    progress(total, total, Path::new(""));
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_names() {
        let spec = OutputSpec::Folder {
            dir: Some("/tmp/out".into()),
            suffix: "-da-ky".into(),
        };
        assert_eq!(
            output_path(&spec, Path::new("/x/hop dong.pdf"), true),
            PathBuf::from("/tmp/out/hop dong-da-ky.pdf")
        );
        let spec = OutputSpec::Folder {
            dir: None,
            suffix: "-signed".into(),
        };
        assert_eq!(
            output_path(&spec, Path::new("/x/a.pdf"), true),
            PathBuf::from("/x/a-signed.pdf")
        );
    }
}
