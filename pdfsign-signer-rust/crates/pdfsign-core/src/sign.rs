//! Incremental-update PDF signing: append signature field + appearance, reserve /Contents,
//! compute the ByteRange digest, embed the CMS. Prior bytes (and prior signatures) are untouched.

use crate::appearance::{build_appearance, AppearanceOptions, ObjAlloc, StampValues};
use crate::cades::{build_cades_detached, RawSigner, Timestamper};
use crate::certinfo::summarize;
use crate::error::{Error, Result};
use crate::pdfobj::{text_string, write_dict, write_literal_string, write_object};
use chrono::{DateTime, FixedOffset, Utc};
use lopdf::{Dictionary, Document, Object, ObjectId};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::io::Write;

/// Vietnam time (no DST), used for the visible date and /M like the WPF app.
pub fn vn_offset() -> FixedOffset {
    FixedOffset::east_opt(7 * 3600).expect("valid offset")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageSpec {
    Last,
    /// 1-based page number.
    Number(u32),
}

impl std::str::FromStr for PageSpec {
    type Err = String;
    fn from_str(s: &str) -> std::result::Result<Self, String> {
        if s.eq_ignore_ascii_case("last") {
            return Ok(PageSpec::Last);
        }
        match s.parse::<u32>() {
            Ok(n) if n >= 1 => Ok(PageSpec::Number(n)),
            _ => Err(format!("page must be >= 1 or LAST, got {s}")),
        }
    }
}

/// Signature box as fractions (0..1) of the *displayed* page, bottom-left origin.
/// Same contract as `placement.rectPct` in pdfsignpro-cloud and `--rectPct` in sign_core.py.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RectPct {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl std::str::FromStr for RectPct {
    type Err = String;
    fn from_str(s: &str) -> std::result::Result<Self, String> {
        let v: Vec<f64> = s
            .split(',')
            .map(|p| p.trim().parse::<f64>().map_err(|e| format!("{p}: {e}")))
            .collect::<std::result::Result<_, _>>()?;
        if v.len() != 4 {
            return Err("rect must be x,y,w,h (4 values 0..1)".into());
        }
        if v.iter().any(|x| !(0.0..=1.0).contains(x) || !x.is_finite()) {
            return Err("rect values must be within 0..1".into());
        }
        Ok(RectPct {
            x: v[0],
            y: v[1],
            w: v[2],
            h: v[3],
        })
    }
}

impl Default for RectPct {
    /// Default of sign_core.py: bottom-right area.
    fn default() -> Self {
        RectPct {
            x: 0.64,
            y: 0.06,
            w: 0.32,
            h: 0.10,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SignatureKind {
    #[default]
    Signature,
    DocTimeStamp,
}

#[derive(Debug, Clone)]
pub struct SignOptions {
    pub page: PageSpec,
    pub rect: RectPct,
    pub invisible: bool,
    pub field_name: Option<String>,
    pub reason: Option<String>,
    pub location: Option<String>,
    pub contact_info: Option<String>,
    pub signing_time: Option<DateTime<Utc>>,
    pub appearance: AppearanceOptions,
    /// Regular signature or document timestamp (PAdES B-LTA).
    pub kind: SignatureKind,
    /// Certificate-derived placeholder values; filled by [`sign_pdf`].
    pub cert_values: StampValues,
    /// Bytes reserved for the CMS blob. Default: 2 KiB + 2x embedded certs, +12 KiB with a timestamp.
    pub contents_reserve: Option<usize>,
}

impl Default for SignOptions {
    fn default() -> Self {
        Self {
            page: PageSpec::Last,
            rect: RectPct::default(),
            invisible: false,
            field_name: None,
            reason: None,
            location: None,
            contact_info: None,
            signing_time: None,
            appearance: AppearanceOptions::default(),
            kind: SignatureKind::Signature,
            cert_values: StampValues::default(),
            contents_reserve: None,
        }
    }
}

/// A PDF with the incremental update appended and an all-zero /Contents placeholder.
#[derive(Debug, Clone)]
pub struct PreparedPdf {
    pub data: Vec<u8>,
    pub byte_range: [usize; 4],
    pub field_name: String,
}

impl PreparedPdf {
    pub fn digest(&self) -> [u8; 32] {
        let [a, b, c, d] = self.byte_range;
        let mut h = Sha256::new();
        h.update(&self.data[a..a + b]);
        h.update(&self.data[c..c + d]);
        h.finalize().into()
    }

    pub fn reserved_bytes(&self) -> usize {
        (self.byte_range[2] - self.byte_range[1] - 2) / 2
    }

    /// Write the DER CMS into the placeholder and return the final PDF bytes.
    pub fn embed(mut self, cms_der: &[u8]) -> Result<Vec<u8>> {
        let reserved = self.reserved_bytes();
        if cms_der.len() > reserved {
            return Err(Error::ContentsTooSmall {
                needed: cms_der.len(),
                reserved,
            });
        }
        let start = self.byte_range[1] + 1;
        let hex = hex::encode_upper(cms_der);
        self.data[start..start + hex.len()].copy_from_slice(hex.as_bytes());
        Ok(self.data)
    }
}

/// Sign `input` and return the signed PDF (single incremental update).
pub fn sign_pdf(
    input: &[u8],
    opts: &SignOptions,
    signer: &mut dyn RawSigner,
    timestamper: Option<&dyn Timestamper>,
) -> Result<Vec<u8>> {
    let cert_der = signer.certificate_der();
    let summary = summarize(&cert_der)?;
    let mut opts = opts.clone();
    if opts.contents_reserve.is_none() {
        let chain_len: usize = signer.chain_der().iter().map(|c| c.len()).sum();
        let base = 2048 + 2 * (cert_der.len() + chain_len);
        opts.contents_reserve = Some(if timestamper.is_some() {
            base + 12288
        } else {
            base
        });
    }
    if opts.appearance.signer_name.is_none() {
        opts.appearance.signer_name = Some(summary.display_name());
    }
    opts.cert_values = StampValues {
        cn: summary.subject_cn.clone().unwrap_or_default(),
        org: summary.subject_o.clone().unwrap_or_default(),
        issuer: summary.issuer_cn.clone().unwrap_or_default(),
        serial: summary.serial.clone(),
        ..Default::default()
    };
    let prepared = prepare(input, &opts)?;
    let digest = prepared.digest();
    let cms = build_cades_detached(signer, &digest, timestamper)?;
    prepared.embed(&cms)
}

struct XrefInfo {
    prev_offset: usize,
    is_stream: bool,
}

fn find_startxref(data: &[u8]) -> Result<XrefInfo> {
    let tail_start = data.len().saturating_sub(4096);
    let tail = &data[tail_start..];
    let pos = tail
        .windows(9)
        .rposition(|w| w == b"startxref")
        .ok_or_else(|| Error::Unsupported("startxref not found".into()))?;
    let rest = &tail[pos + 9..];
    let digits: String = rest
        .iter()
        .skip_while(|c| c.is_ascii_whitespace())
        .take_while(|c| c.is_ascii_digit())
        .map(|c| *c as char)
        .collect();
    let prev_offset: usize = digits
        .parse()
        .map_err(|_| Error::Unsupported("bad startxref".into()))?;
    if prev_offset >= data.len() {
        return Err(Error::Unsupported("startxref beyond EOF".into()));
    }
    let at = &data[prev_offset..];
    let is_stream = !at.starts_with(b"xref");
    Ok(XrefInfo {
        prev_offset,
        is_stream,
    })
}

fn num(doc: &Document, o: &Object) -> Option<f64> {
    match o {
        Object::Integer(i) => Some(*i as f64),
        Object::Real(r) => Some(*r as f64),
        Object::Reference(id) => doc.get_object(*id).ok().and_then(|o| num(doc, o)),
        _ => None,
    }
}

fn deref<'a>(doc: &'a Document, o: &'a Object) -> &'a Object {
    match o {
        Object::Reference(id) => doc.get_object(*id).unwrap_or(o),
        _ => o,
    }
}

/// Look up a possibly inherited page attribute (MediaBox, Rotate, ...).
fn inherited<'a>(doc: &'a Document, page_id: ObjectId, key: &[u8]) -> Option<&'a Object> {
    let mut cur = Some(page_id);
    let mut guard = 0;
    while let Some(id) = cur {
        let dict = doc.get_dictionary(id).ok()?;
        if let Ok(v) = dict.get(key) {
            return Some(deref(doc, v));
        }
        cur = dict.get(b"Parent").ok().and_then(|p| p.as_reference().ok());
        guard += 1;
        if guard > 64 {
            break;
        }
    }
    None
}

#[derive(Debug, Clone, Copy)]
pub struct PageGeometry {
    pub x0: f64,
    pub y0: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: i64,
}

fn page_geometry(doc: &Document, page_id: ObjectId) -> PageGeometry {
    let mb = inherited(doc, page_id, b"MediaBox")
        .and_then(|o| o.as_array().ok())
        .and_then(|a| {
            let v: Vec<f64> = a.iter().filter_map(|o| num(doc, o)).collect();
            (v.len() == 4).then_some(v)
        })
        .unwrap_or_else(|| vec![0.0, 0.0, 595.2, 841.8]);
    let rotation = inherited(doc, page_id, b"Rotate")
        .and_then(|o| num(doc, o))
        .unwrap_or(0.0) as i64;
    PageGeometry {
        x0: mb[0].min(mb[2]),
        y0: mb[1].min(mb[3]),
        width: (mb[2] - mb[0]).abs(),
        height: (mb[3] - mb[1]).abs(),
        rotation: rotation.rem_euclid(360),
    }
}

/// Map rectPct (displayed space) to an unrotated user-space box.
/// Returns (llx, lly, urx, ury, displayed_width, displayed_height).
///
/// /Rotate turns the page clockwise for display, so for 90 the displayed bottom-left is the
/// user-space bottom-right. `_box_from_pct` in pades_signer.py has the 90/270 cases swapped.
pub fn box_from_pct(g: PageGeometry, r: RectPct) -> (f64, f64, f64, f64, f64, f64) {
    let (dw, dh) = if g.rotation == 90 || g.rotation == 270 {
        (g.height, g.width)
    } else {
        (g.width, g.height)
    };
    let (dx1, dy1) = (r.x * dw, r.y * dh);
    let (dx2, dy2) = ((r.x + r.w) * dw, (r.y + r.h) * dh);
    let to_user = |px: f64, py: f64| match g.rotation {
        90 => (g.width - py, px),
        180 => (g.width - px, g.height - py),
        270 => (py, g.height - px),
        _ => (px, py),
    };
    let (ux1, uy1) = to_user(dx1, dy1);
    let (ux2, uy2) = to_user(dx2, dy2);
    (
        g.x0 + ux1.min(ux2),
        g.y0 + uy1.min(uy2),
        g.x0 + ux1.max(ux2),
        g.y0 + uy1.max(uy2),
        (dx2 - dx1).abs(),
        (dy2 - dy1).abs(),
    )
}

fn pdf_date(t: DateTime<FixedOffset>) -> String {
    let off = t.offset().local_minus_utc();
    let sign = if off >= 0 { '+' } else { '-' };
    let off = off.abs();
    format!(
        "D:{}{}{:02}'{:02}'",
        t.format("%Y%m%d%H%M%S"),
        sign,
        off / 3600,
        (off % 3600) / 60
    )
}

fn collect_field_names(doc: &Document, field: &Object, out: &mut BTreeSet<String>, depth: usize) {
    if depth > 32 {
        return;
    }
    let Ok(d) = deref(doc, field).as_dict() else {
        return;
    };
    if let Ok(Object::String(s, _)) = d.get(b"T").map(|o| deref(doc, o)) {
        out.insert(String::from_utf8_lossy(s).into_owned());
    }
    if let Ok(kids) = d.get(b"Kids").map(|o| deref(doc, o)) {
        if let Ok(arr) = kids.as_array() {
            for k in arr {
                collect_field_names(doc, k, out, depth + 1);
            }
        }
    }
}

/// Append the signature field, widget and placeholder. Pure function of input + options.
pub fn prepare(input: &[u8], opts: &SignOptions) -> Result<PreparedPdf> {
    let doc = Document::load_mem(input)?;
    if doc.was_encrypted() || doc.trailer.has(b"Encrypt") {
        return Err(Error::Unsupported(
            "encrypted PDFs are not supported yet".into(),
        ));
    }
    let xref = find_startxref(input)?;

    let pages = doc.get_pages();
    if pages.is_empty() {
        return Err(Error::Unsupported("document has no pages".into()));
    }
    let page_id = match opts.page {
        PageSpec::Last => *pages.values().last().expect("non-empty"),
        PageSpec::Number(n) => *pages.get(&n).ok_or_else(|| {
            Error::Placement(format!("page {n} out of range (1..{})", pages.len()))
        })?,
    };

    let root_id = doc
        .trailer
        .get(b"Root")
        .and_then(|o| o.as_reference())
        .map_err(|_| Error::Unsupported("trailer has no /Root reference".into()))?;
    let size = doc
        .trailer
        .get(b"Size")
        .ok()
        .and_then(|o| o.as_i64().ok())
        .unwrap_or(0)
        .max(0) as u32;
    let mut alloc = ObjAlloc::new(size.max(doc.max_id + 1));
    let mut modified: BTreeMap<ObjectId, Object> = BTreeMap::new();

    let mut catalog = doc.get_dictionary(root_id)?.clone();
    let mut existing = BTreeSet::new();
    let acro_ref = catalog.get(b"AcroForm").ok().cloned();
    let mut acro: Dictionary = match &acro_ref {
        Some(Object::Reference(id)) => doc.get_dictionary(*id)?.clone(),
        Some(Object::Dictionary(d)) => d.clone(),
        _ => Dictionary::new(),
    };
    let mut fields_array_id: Option<ObjectId> = None;
    let mut fields: Vec<Object> = match acro.get(b"Fields") {
        Ok(Object::Reference(id)) => {
            fields_array_id = Some(*id);
            doc.get_object(*id)?.as_array()?.clone()
        }
        Ok(Object::Array(a)) => a.clone(),
        _ => Vec::new(),
    };
    for f in &fields {
        collect_field_names(&doc, f, &mut existing, 0);
    }
    let field_name = match &opts.field_name {
        Some(n) if existing.contains(n) => {
            return Err(Error::Placement(format!("field {n} already exists")))
        }
        Some(n) => n.clone(),
        None => (1..)
            .map(|i| format!("Signature{i}"))
            .find(|n| !existing.contains(n))
            .expect("unbounded"),
    };

    let geom = page_geometry(&doc, page_id);
    let (llx, lly, urx, ury, disp_w, disp_h) = box_from_pct(geom, opts.rect);
    let signing_time = opts
        .signing_time
        .unwrap_or_else(Utc::now)
        .with_timezone(&vn_offset());

    let sig_id = alloc.reserve();
    let widget_id = alloc.reserve();

    let mut widget = Dictionary::new();
    widget.set("Type", Object::Name(b"Annot".to_vec()));
    widget.set("Subtype", Object::Name(b"Widget".to_vec()));
    widget.set("FT", Object::Name(b"Sig".to_vec()));
    widget.set("T", text_string(&field_name));
    widget.set("V", Object::Reference(sig_id));
    widget.set("F", Object::Integer(132));
    widget.set("P", Object::Reference(page_id));
    if opts.invisible || opts.kind == SignatureKind::DocTimeStamp || disp_w < 1.0 || disp_h < 1.0 {
        widget.set(
            "Rect",
            Object::Array(vec![0.into(), 0.into(), 0.into(), 0.into()]),
        );
    } else {
        let values = StampValues {
            name: opts.appearance.signer_name.clone().unwrap_or_default(),
            date: opts.appearance.time_text.clone().unwrap_or_else(|| {
                signing_time
                    .format(&opts.appearance.template.date_format)
                    .to_string()
            }),
            reason: opts.reason.clone().unwrap_or_default(),
            location: opts.location.clone().unwrap_or_default(),
            ..opts.cert_values.clone()
        };
        let ap_id = build_appearance(
            &mut alloc,
            disp_w,
            disp_h,
            geom.rotation,
            &values,
            &opts.appearance,
        )?;
        widget.set(
            "Rect",
            Object::Array(
                [llx, lly, urx, ury]
                    .iter()
                    .map(|v| Object::Real(*v as f32))
                    .collect(),
            ),
        );
        let mut ap = Dictionary::new();
        ap.set("N", Object::Reference(ap_id));
        widget.set("AP", Object::Dictionary(ap));
    }
    alloc.put(widget_id, Object::Dictionary(widget));

    let mut page = doc.get_dictionary(page_id)?.clone();
    match page.get(b"Annots") {
        Ok(Object::Reference(id)) => {
            let mut arr = doc.get_object(*id)?.as_array()?.clone();
            arr.push(Object::Reference(widget_id));
            modified.insert(*id, Object::Array(arr));
        }
        Ok(Object::Array(a)) => {
            let mut arr = a.clone();
            arr.push(Object::Reference(widget_id));
            page.set("Annots", Object::Array(arr));
            modified.insert(page_id, Object::Dictionary(page));
        }
        _ => {
            page.set("Annots", Object::Array(vec![Object::Reference(widget_id)]));
            modified.insert(page_id, Object::Dictionary(page));
        }
    }

    fields.push(Object::Reference(widget_id));
    match fields_array_id {
        Some(id) => {
            modified.insert(id, Object::Array(fields));
        }
        None => acro.set("Fields", Object::Array(fields)),
    }
    acro.set("SigFlags", Object::Integer(3));
    match acro_ref {
        Some(Object::Reference(id)) => {
            modified.insert(id, Object::Dictionary(acro));
        }
        _ => {
            let acro_id = alloc.add(Object::Dictionary(acro));
            catalog.set("AcroForm", Object::Reference(acro_id));
            modified.insert(root_id, Object::Dictionary(catalog));
        }
    }

    // Serialize the incremental section.
    let mut out = input.to_vec();
    if !matches!(out.last(), Some(b'\n') | Some(b'\r')) {
        out.push(b'\n');
    }
    let mut offsets: BTreeMap<ObjectId, usize> = BTreeMap::new();
    let mut all: BTreeMap<ObjectId, Object> = modified;
    for (id, obj) in alloc.objects.drain(..) {
        all.insert(id, obj);
    }

    // Signature dictionary with fixed-width placeholders.
    let reserve = opts.contents_reserve.unwrap_or(16384);
    offsets.insert(sig_id, out.len());
    let is_dts = opts.kind == SignatureKind::DocTimeStamp;
    let _ = write!(
        out,
        "{} {} obj\n<</Type /{}/Filter /Adobe.PPKLite/SubFilter /{}",
        sig_id.0,
        sig_id.1,
        if is_dts { "DocTimeStamp" } else { "Sig" },
        if is_dts {
            "ETSI.RFC3161"
        } else {
            "ETSI.CAdES.detached"
        }
    );
    if !is_dts {
        out.extend_from_slice(b"/M ");
        write_literal_string(&mut out, pdf_date(signing_time).as_bytes());
    }
    for (key, val) in [
        ("Reason", &opts.reason),
        ("Location", &opts.location),
        ("ContactInfo", &opts.contact_info),
    ] {
        if let Some(v) = val {
            let _ = write!(out, "/{key} ");
            write_object(&mut out, &text_string(v));
        }
    }
    out.extend_from_slice(b"/ByteRange ");
    let br_pos = out.len();
    const BR_WIDTH: usize = 60;
    out.extend(std::iter::repeat_n(b' ', BR_WIDTH));
    out.extend_from_slice(b"/Contents ");
    let lt_pos = out.len();
    out.push(b'<');
    out.extend(std::iter::repeat_n(b'0', reserve * 2));
    out.push(b'>');
    let gt_end = out.len();
    out.extend_from_slice(b">>\nendobj\n");

    write_objects_and_xref(
        &mut out,
        &mut offsets,
        &all,
        &doc,
        root_id,
        &xref,
        alloc.next_id,
    );

    let byte_range = [0, lt_pos, gt_end, out.len() - gt_end];
    let br = format!(
        "[{} {} {} {}]",
        byte_range[0], byte_range[1], byte_range[2], byte_range[3]
    );
    if br.len() > BR_WIDTH {
        return Err(Error::Unsupported("ByteRange placeholder overflow".into()));
    }
    out[br_pos..br_pos + br.len()].copy_from_slice(br.as_bytes());

    Ok(PreparedPdf {
        data: out,
        byte_range,
        field_name,
    })
}

/// Write `all` objects, then the xref section (classic or stream, matching the original) and trailer.
fn write_objects_and_xref(
    out: &mut Vec<u8>,
    offsets: &mut BTreeMap<ObjectId, usize>,
    all: &BTreeMap<ObjectId, Object>,
    doc: &Document,
    root_id: ObjectId,
    xref: &XrefInfo,
    next_id: u32,
) {
    for (id, obj) in all {
        offsets.insert(*id, out.len());
        let _ = writeln!(out, "{} {} obj", id.0, id.1);
        write_object(out, obj);
        out.extend_from_slice(b"\nendobj\n");
    }

    let mut trailer = Dictionary::new();
    trailer.set("Root", Object::Reference(root_id));
    if let Ok(info) = doc.trailer.get(b"Info") {
        trailer.set("Info", info.clone());
    }
    if let Ok(id) = doc.trailer.get(b"ID") {
        trailer.set("ID", id.clone());
    }
    trailer.set("Prev", Object::Integer(xref.prev_offset as i64));

    if xref.is_stream {
        let xref_id = (next_id, 0u16);
        let new_size = next_id + 1;
        let xref_offset = out.len();
        offsets.insert(xref_id, xref_offset);
        let (index, data) = xref_stream_entries(offsets);
        trailer.set("Type", Object::Name(b"XRef".to_vec()));
        trailer.set("Size", Object::Integer(new_size as i64));
        trailer.set(
            "Index",
            Object::Array(index.into_iter().map(Object::Integer).collect()),
        );
        trailer.set("W", Object::Array(vec![1.into(), 4.into(), 2.into()]));
        trailer.set("Length", Object::Integer(data.len() as i64));
        let _ = writeln!(out, "{} 0 obj", xref_id.0);
        write_dict(out, &trailer);
        out.extend_from_slice(b"\nstream\n");
        out.extend_from_slice(&data);
        out.extend_from_slice(b"\nendstream\nendobj\n");
        let _ = write!(out, "startxref\n{xref_offset}\n%%EOF\n");
    } else {
        let xref_offset = out.len();
        out.extend_from_slice(b"xref\n");
        for (start, ids) in subsections(offsets) {
            let _ = writeln!(out, "{start} {}", ids.len());
            for id in ids {
                let _ = write!(out, "{:010} {:05} n\r\n", offsets[&id], id.1);
            }
        }
        trailer.set("Size", Object::Integer(next_id as i64));
        out.extend_from_slice(b"trailer\n");
        write_dict(out, &trailer);
        let _ = write!(out, "\nstartxref\n{xref_offset}\n%%EOF\n");
    }
}

/// Append one incremental update containing objects produced by `build`
/// (new objects via the allocator, modified ones keyed by their existing id).
pub fn append_update(
    input: &[u8],
    build: impl FnOnce(&Document, &mut ObjAlloc, &mut BTreeMap<ObjectId, Object>) -> Result<()>,
) -> Result<Vec<u8>> {
    let doc = Document::load_mem(input)?;
    if doc.was_encrypted() || doc.trailer.has(b"Encrypt") {
        return Err(Error::Unsupported(
            "encrypted PDFs are not supported yet".into(),
        ));
    }
    let xref = find_startxref(input)?;
    let root_id = doc
        .trailer
        .get(b"Root")
        .and_then(|o| o.as_reference())
        .map_err(|_| Error::Unsupported("trailer has no /Root reference".into()))?;
    let size = doc
        .trailer
        .get(b"Size")
        .ok()
        .and_then(|o| o.as_i64().ok())
        .unwrap_or(0)
        .max(0) as u32;
    let mut alloc = ObjAlloc::new(size.max(doc.max_id + 1));
    let mut all: BTreeMap<ObjectId, Object> = BTreeMap::new();
    build(&doc, &mut alloc, &mut all)?;
    for (id, obj) in alloc.objects.drain(..) {
        all.insert(id, obj);
    }
    let mut out = input.to_vec();
    if !matches!(out.last(), Some(b'\n') | Some(b'\r')) {
        out.push(b'\n');
    }
    let mut offsets = BTreeMap::new();
    write_objects_and_xref(
        &mut out,
        &mut offsets,
        &all,
        &doc,
        root_id,
        &xref,
        alloc.next_id,
    );
    Ok(out)
}

fn subsections(offsets: &BTreeMap<ObjectId, usize>) -> Vec<(u32, Vec<ObjectId>)> {
    let mut out: Vec<(u32, Vec<ObjectId>)> = Vec::new();
    for id in offsets.keys() {
        match out.last_mut() {
            Some((start, ids)) if *start + ids.len() as u32 == id.0 => ids.push(*id),
            _ => out.push((id.0, vec![*id])),
        }
    }
    out
}

fn xref_stream_entries(offsets: &BTreeMap<ObjectId, usize>) -> (Vec<i64>, Vec<u8>) {
    let mut index = Vec::new();
    let mut data = Vec::new();
    for (start, ids) in subsections(offsets) {
        index.push(start as i64);
        index.push(ids.len() as i64);
        for id in ids {
            data.push(1u8);
            data.extend_from_slice(&(offsets[&id] as u32).to_be_bytes());
            data.extend_from_slice(&id.1.to_be_bytes());
        }
    }
    (index, data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rect_pct_rotation_mapping() {
        // Displayed bottom-left corner box on a portrait page shown as landscape.
        let r = RectPct {
            x: 0.0,
            y: 0.0,
            w: 0.5,
            h: 0.25,
        };
        let g90 = PageGeometry {
            x0: 0.0,
            y0: 0.0,
            width: 600.0,
            height: 800.0,
            rotation: 90,
        };
        let (llx, lly, urx, ury, dw, dh) = box_from_pct(g90, r);
        assert_eq!((dw, dh), (400.0, 150.0));
        // Rotate 90 (clockwise): displayed bottom-left = user-space bottom-right.
        assert_eq!((llx, lly, urx, ury), (450.0, 0.0, 600.0, 400.0));
        // Rotate 270: displayed bottom-left = user-space top-left.
        let g270 = PageGeometry {
            rotation: 270,
            ..g90
        };
        let (llx, lly, urx, ury, _, _) = box_from_pct(g270, r);
        assert_eq!((llx, lly, urx, ury), (0.0, 400.0, 150.0, 800.0));
        let g180 = PageGeometry {
            rotation: 180,
            ..g90
        };
        let (llx, lly, urx, ury, _, _) = box_from_pct(g180, r);
        assert_eq!((llx, lly, urx, ury), (300.0, 600.0, 600.0, 800.0));
    }

    #[test]
    fn parses_cli_specs() {
        assert_eq!("LAST".parse::<PageSpec>().unwrap(), PageSpec::Last);
        assert_eq!("3".parse::<PageSpec>().unwrap(), PageSpec::Number(3));
        assert!("0".parse::<PageSpec>().is_err());
        assert!("0.1,0.1,0.3".parse::<RectPct>().is_err());
        assert!("0.1,0.1,1.3,0.1".parse::<RectPct>().is_err());
    }

    #[test]
    fn pdf_date_format() {
        let t = DateTime::parse_from_rfc3339("2026-11-14T18:05:09+07:00").unwrap();
        assert_eq!(pdf_date(t), "D:20261114180509+07'00'");
    }
}
