//! Visible signature appearance (form XObject) with an embedded, subsetted Unicode font.
//!
//! Driven by [`StampTemplate`]. The default template reproduces the WPF `valid` stamp
//! (`desktop-signer/signer/sig_appearance.py`): red border, red tick, "Ký bởi" + "Thời gian".

use crate::error::{Error, Result};
use crate::pdfobj::fmt_real;
use flate2::{write::ZlibEncoder, Compression};
use lopdf::{Dictionary, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Write;
use unicode_normalization::UnicodeNormalization;

pub static DEFAULT_FONT: &[u8] = include_bytes!("../../../assets/fonts/NotoSans-Regular.ttf");

const PADDING: f64 = 6.0;
const GAP: f64 = 8.0;
const LINE_HEIGHT: f64 = 1.25;
const RED: (f64, f64, f64) = (0.937, 0.231, 0.384);
const GRAY: (f64, f64, f64) = (0.29, 0.34, 0.39);
pub const SIGNER_PREFIX: &str = "Ký bởi: ";
pub const TS_PREFIX: &str = "Thời gian: ";

#[derive(Debug, Clone, Default)]
pub struct AppearanceOptions {
    /// Layout and text lines. Default reproduces the WPF `valid` stamp.
    pub template: StampTemplate,
    /// Overrides `{name}` (default: subject O, else CN of the signing certificate).
    pub signer_name: Option<String>,
    /// Overrides `{date}` (default: signing time in Vietnam time, `template.date_format`).
    pub time_text: Option<String>,
    /// Seal (con dấu) image, PNG or JPEG.
    pub image: Option<Vec<u8>>,
    /// Handwritten signature image, PNG or JPEG.
    pub signature_image: Option<Vec<u8>>,
    /// Alternative TrueType font (must cover Vietnamese). Defaults to bundled Noto Sans.
    pub font: Option<Vec<u8>>,
}

/// Allocates object ids for new objects appended in the incremental update.
pub struct ObjAlloc {
    pub next_id: u32,
    pub objects: Vec<(ObjectId, Object)>,
}

impl ObjAlloc {
    pub fn new(next_id: u32) -> Self {
        Self {
            next_id,
            objects: Vec::new(),
        }
    }

    pub fn reserve(&mut self) -> ObjectId {
        let id = (self.next_id, 0);
        self.next_id += 1;
        id
    }

    pub fn add(&mut self, obj: Object) -> ObjectId {
        let id = self.reserve();
        self.objects.push((id, obj));
        id
    }

    pub fn put(&mut self, id: ObjectId, obj: Object) {
        self.objects.push((id, obj));
    }
}

struct TextFont<'a> {
    face: ttf_parser::Face<'a>,
    upem: f64,
}

impl<'a> TextFont<'a> {
    fn new(data: &'a [u8]) -> Result<Self> {
        let face = ttf_parser::Face::parse(data, 0).map_err(|e| Error::Font(e.to_string()))?;
        let upem = face.units_per_em() as f64;
        Ok(Self { face, upem })
    }

    fn gid(&self, c: char) -> u16 {
        self.face.glyph_index(c).map(|g| g.0).unwrap_or(0)
    }

    fn width(&self, text: &str, size: f64) -> f64 {
        text.chars()
            .map(|c| {
                self.face
                    .glyph_hor_advance(ttf_parser::GlyphId(self.gid(c)))
                    .unwrap_or(0) as f64
            })
            .sum::<f64>()
            * size
            / self.upem
    }

    fn wrap(&self, text: &str, max_w: f64, size: f64) -> Vec<String> {
        if text.is_empty() || max_w <= 0.0 {
            return Vec::new();
        }
        let mut lines = Vec::new();
        let mut current: Vec<String> = Vec::new();
        for word in text.split_whitespace() {
            let mut candidate = current.clone();
            candidate.push(word.to_string());
            if self.width(&candidate.join(" "), size) <= max_w {
                current = candidate;
                continue;
            }
            if !current.is_empty() {
                lines.push(current.join(" "));
                current.clear();
            }
            if self.width(word, size) <= max_w {
                current.push(word.to_string());
                continue;
            }
            let mut cur = String::new();
            for c in word.chars() {
                let mut cand = cur.clone();
                cand.push(c);
                if self.width(&cand, size) <= max_w {
                    cur = cand;
                } else {
                    if !cur.is_empty() {
                        lines.push(std::mem::take(&mut cur));
                    }
                    cur.push(c);
                }
            }
            if !cur.is_empty() {
                current.push(cur);
            }
        }
        if !current.is_empty() {
            lines.push(current.join(" "));
        }
        lines
    }
}

struct TextRun {
    text: String,
    x: f64,
    y: f64,
    size: f64,
    color: (f64, f64, f64),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum StampLayout {
    /// Images in a column on the left, text on the right (tick icon when there is no image).
    #[default]
    ImageLeft,
    /// Images on top, text below.
    ImageTop,
    /// Images behind the text, filling the box.
    ImageBackground,
    /// Text only.
    TextOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum TextAlign {
    #[default]
    Left,
    Center,
}

/// A user-defined signature appearance. Text lines may use placeholders:
/// `{name}` (O, else CN), `{cn}`, `{org}`, `{issuer}`, `{serial}`, `{date}`, `{reason}`, `{location}`.
/// A line whose placeholders all resolve to empty strings is dropped.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StampTemplate {
    pub id: String,
    pub name: String,
    pub lines: Vec<String>,
    pub layout: StampLayout,
    pub align: TextAlign,
    pub show_border: bool,
    pub show_check_icon: bool,
    /// `#rrggbb`, used for the first line, border and icon.
    pub accent_color: String,
    /// `#rrggbb`, used for the other lines.
    pub text_color: String,
    /// Fixed font size in points; `None` = largest size that fits.
    pub font_size: Option<f64>,
    /// chrono format string for `{date}` (Vietnam time).
    pub date_format: String,
    /// File paths, resolved by the application layer into `AppearanceOptions` bytes.
    pub seal_image: Option<String>,
    pub signature_image: Option<String>,
}

impl Default for StampTemplate {
    fn default() -> Self {
        StampTemplate {
            id: "default".into(),
            name: "Mặc định (dấu tích)".into(),
            lines: vec![
                format!("{SIGNER_PREFIX}{{name}}"),
                format!("{TS_PREFIX}{{date}}"),
            ],
            layout: StampLayout::ImageLeft,
            align: TextAlign::Left,
            show_border: true,
            show_check_icon: true,
            accent_color: "#ef3b62".into(),
            text_color: "#4b5563".into(),
            font_size: None,
            date_format: "%d/%m/%Y %H:%M:%S".into(),
            seal_image: None,
            signature_image: None,
        }
    }
}

impl StampTemplate {
    /// Built-in presets offered to new users.
    pub fn presets() -> Vec<StampTemplate> {
        vec![
            StampTemplate::default(),
            StampTemplate {
                id: "seal".into(),
                name: "Con dấu + chữ".into(),
                lines: vec!["{name}".into(), "{date}".into()],
                show_border: false,
                show_check_icon: false,
                accent_color: "#dc2626".into(),
                ..Default::default()
            },
            StampTemplate {
                id: "handwritten".into(),
                name: "Chữ ký tay phía trên".into(),
                lines: vec!["{cn}".into(), "{org}".into(), "Ngày ký: {date}".into()],
                layout: StampLayout::ImageTop,
                align: TextAlign::Center,
                show_border: false,
                show_check_icon: false,
                accent_color: "#1f2937".into(),
                date_format: "%d/%m/%Y".into(),
                ..Default::default()
            },
            StampTemplate {
                id: "full".into(),
                name: "Đầy đủ thông tin".into(),
                lines: vec![
                    "Ký bởi: {name}".into(),
                    "Người ký: {cn}".into(),
                    "Thời gian: {date}".into(),
                    "Lý do: {reason}".into(),
                    "Nơi ký: {location}".into(),
                ],
                ..Default::default()
            },
        ]
    }
}

/// Values substituted into template placeholders.
#[derive(Debug, Clone, Default)]
pub struct StampValues {
    pub name: String,
    pub cn: String,
    pub org: String,
    pub issuer: String,
    pub serial: String,
    pub date: String,
    pub reason: String,
    pub location: String,
}

impl StampValues {
    fn get(&self, key: &str) -> Option<&str> {
        Some(match key {
            "name" => &self.name,
            "cn" => &self.cn,
            "org" => &self.org,
            "issuer" => &self.issuer,
            "serial" => &self.serial,
            "date" => &self.date,
            "reason" => &self.reason,
            "location" => &self.location,
            _ => return None,
        })
    }

    /// Substitute placeholders; `None` when the line only had empty placeholders.
    pub fn render_line(&self, line: &str) -> Option<String> {
        let mut out = String::new();
        let mut rest = line;
        let (mut placeholders, mut filled) = (0, 0);
        while let Some(start) = rest.find('{') {
            out.push_str(&rest[..start]);
            let Some(len) = rest[start..].find('}') else {
                break;
            };
            let key = &rest[start + 1..start + len];
            match self.get(key) {
                Some(v) => {
                    placeholders += 1;
                    if !v.trim().is_empty() {
                        filled += 1;
                    }
                    out.push_str(v);
                }
                None => out.push_str(&rest[start..start + len + 1]),
            }
            rest = &rest[start + len + 1..];
        }
        out.push_str(rest);
        if placeholders > 0 && filled == 0 {
            return None;
        }
        Some(out)
    }
}

fn parse_color(hex: &str, fallback: (f64, f64, f64)) -> (f64, f64, f64) {
    let h = hex.trim().trim_start_matches('#');
    if h.len() != 6 {
        return fallback;
    }
    let c = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).map(|v| v as f64 / 255.0);
    match (c(0), c(2), c(4)) {
        (Ok(r), Ok(g), Ok(b)) => (r, g, b),
        _ => fallback,
    }
}

fn round3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

/// Build the appearance form XObject and its resources. Returns the XObject id.
pub fn build_appearance(
    alloc: &mut ObjAlloc,
    width: f64,
    height: f64,
    rotation: i64,
    values: &StampValues,
    opts: &AppearanceOptions,
) -> Result<ObjectId> {
    let font_data: &[u8] = opts.font.as_deref().unwrap_or(DEFAULT_FONT);
    let font = TextFont::new(font_data)?;
    let tpl = &opts.template;
    let accent = parse_color(&tpl.accent_color, RED);
    let accent = (round3(accent.0), round3(accent.1), round3(accent.2));
    let text_color = parse_color(&tpl.text_color, GRAY);
    let text_color = (
        round3(text_color.0),
        round3(text_color.1),
        round3(text_color.2),
    );

    let mut ops: Vec<String> = Vec::new();
    let mut runs: Vec<TextRun> = Vec::new();
    let mut resources = Dictionary::new();
    let mut xobjs = Dictionary::new();

    let mut images = Vec::new();
    for bytes in [&opts.image, &opts.signature_image].into_iter().flatten() {
        images.push(embed_image(alloc, bytes)?);
    }
    let layout = if images.is_empty() && tpl.layout != StampLayout::TextOnly {
        StampLayout::ImageLeft
    } else {
        tpl.layout
    };

    let inner = (
        PADDING,
        PADDING,
        (width - 2.0 * PADDING).max(1.0),
        (height - 2.0 * PADDING).max(1.0),
    );
    let draw_images =
        |ops: &mut Vec<String>, xobjs: &mut Dictionary, area: (f64, f64, f64, f64)| {
            let n = images.len() as f64;
            let cell_w = area.2 / n;
            for (i, (id, iw, ih)) in images.iter().enumerate() {
                let scale = (cell_w / iw).min(area.3 / ih);
                let (dw, dh) = (iw * scale, ih * scale);
                let x = area.0 + i as f64 * cell_w + (cell_w - dw) / 2.0;
                let y = area.1 + (area.3 - dh) / 2.0;
                let name = format!("Im{}", i + 1);
                ops.push(format!(
                    "q {} 0 0 {} {} {} cm /{name} Do Q",
                    fmt_real(dw),
                    fmt_real(dh),
                    fmt_real(x),
                    fmt_real(y)
                ));
                xobjs.set(name, Object::Reference(*id));
            }
        };

    if tpl.show_border {
        ops.push(format!(
            "q 1 w {} {} {} RG {} {} {} {} re S Q",
            accent.0,
            accent.1,
            accent.2,
            fmt_real(inner.0),
            fmt_real(inner.1),
            fmt_real(inner.2),
            fmt_real(inner.3)
        ));
    }

    // Text area (x, y, w, h) in form space.
    let text_area = match layout {
        StampLayout::ImageLeft if !images.is_empty() => {
            let col_w = (width * 0.45).min(inner.3 * images.len() as f64);
            draw_images(&mut ops, &mut xobjs, (inner.0, inner.1, col_w, inner.3));
            let x = inner.0 + col_w + PADDING;
            (x, inner.1, (width - x - PADDING).max(10.0), inner.3)
        }
        StampLayout::ImageTop => {
            let img_h = inner.3 * 0.5;
            draw_images(
                &mut ops,
                &mut xobjs,
                (inner.0, inner.1 + inner.3 - img_h, inner.2, img_h),
            );
            (inner.0, inner.1, inner.2, inner.3 - img_h - 2.0)
        }
        StampLayout::ImageBackground => {
            draw_images(&mut ops, &mut xobjs, inner);
            inner
        }
        _ if tpl.show_check_icon && layout != StampLayout::TextOnly => {
            let icon = (height * 0.55).clamp(18.0, 40.0).min(inner.3);
            let (cx, cy, r) = (PADDING + icon / 2.0, height / 2.0, icon / 2.0 - 2.0);
            ops.push(format!(
                "q {} {} {} rg {} f Q",
                accent.0,
                accent.1,
                accent.2,
                circle_path(cx, cy, r)
            ));
            ops.push(format!(
                "q 1 1 1 RG 2 w 1 J 1 j {} {} m {} {} l {} {} l S Q",
                fmt_real(cx - 0.40 * r),
                fmt_real(cy + 0.05 * r),
                fmt_real(cx - 0.15 * r),
                fmt_real(cy - 0.25 * r),
                fmt_real(cx + 0.45 * r),
                fmt_real(cy + 0.30 * r)
            ));
            let x = PADDING + icon + GAP;
            (x, inner.1, (width - x - PADDING).max(10.0), inner.3)
        }
        _ => (inner.0 + 2.0, inner.1, inner.2 - 4.0, inner.3),
    };
    if !xobjs.is_empty() {
        resources.set("XObject", Object::Dictionary(xobjs));
    }

    let lines: Vec<String> = tpl
        .lines
        .iter()
        .filter_map(|l| values.render_line(l))
        .map(|l| l.nfc().collect::<String>())
        .collect();
    let (tx, ty, tw, th) = text_area;
    let start = tpl
        .font_size
        .unwrap_or_else(|| {
            (th / (lines.len().max(1) as f64 * LINE_HEIGHT))
                .min(height * 0.2)
                .min(12.0)
        })
        .floor()
        .clamp(4.0, 72.0) as i64;
    let mut size = 4.0;
    let mut wrapped: Vec<(usize, String)> = Vec::new();
    for fs in (4..=start.max(4)).rev() {
        let fs = fs as f64;
        wrapped = lines
            .iter()
            .enumerate()
            .flat_map(|(i, l)| font.wrap(l, tw, fs).into_iter().map(move |w| (i, w)))
            .collect();
        size = fs;
        if wrapped.len() as f64 * fs * LINE_HEIGHT <= th {
            break;
        }
    }
    let leading = size * LINE_HEIGHT;
    let block_h = wrapped.len() as f64 * leading;
    let mut y = (ty + size * 0.2).max(ty + (th + block_h) / 2.0 - size);
    for (i, text) in wrapped {
        let x = match tpl.align {
            TextAlign::Left => tx,
            TextAlign::Center => tx + ((tw - font.width(&text, size)) / 2.0).max(0.0),
        };
        let color = if i == 0 { accent } else { text_color };
        runs.push(TextRun {
            text,
            x,
            y,
            size,
            color,
        });
        y -= leading;
    }

    if !runs.is_empty() {
        let mut remapper = subsetter::GlyphRemapper::new();
        let mut to_unicode: BTreeMap<u16, char> = BTreeMap::new();
        let mut widths: BTreeMap<u16, f64> = BTreeMap::new();
        for run in &runs {
            let mut hexs = String::new();
            for c in run.text.chars() {
                let gid = font.gid(c);
                let new_gid = remapper.remap(gid);
                to_unicode.entry(new_gid).or_insert(c);
                let adv = font
                    .face
                    .glyph_hor_advance(ttf_parser::GlyphId(gid))
                    .unwrap_or(0) as f64;
                widths.insert(new_gid, adv * 1000.0 / font.upem);
                hexs.push_str(&format!("{new_gid:04X}"));
            }
            ops.push(format!(
                "BT /F1 {} Tf {} {} {} rg {} {} Td <{}> Tj ET",
                fmt_real(run.size),
                run.color.0,
                run.color.1,
                run.color.2,
                fmt_real(run.x),
                fmt_real(run.y),
                hexs
            ));
        }
        let font_id = embed_type0_font(alloc, &font, font_data, &remapper, &to_unicode, &widths)?;
        let mut fonts = Dictionary::new();
        fonts.set("F1", Object::Reference(font_id));
        resources.set("Font", Object::Dictionary(fonts));
    }

    let content = ops.join("\n").into_bytes();
    let mut dict = Dictionary::new();
    dict.set("Type", Object::Name(b"XObject".to_vec()));
    dict.set("Subtype", Object::Name(b"Form".to_vec()));
    dict.set(
        "BBox",
        Object::Array(vec![
            0.into(),
            0.into(),
            Object::Real(width as f32),
            Object::Real(height as f32),
        ]),
    );
    // Counter-rotate so the stamp reads upright on pages with /Rotate.
    let matrix: Option<[i64; 4]> = match rotation.rem_euclid(360) {
        90 => Some([0, 1, -1, 0]),
        180 => Some([-1, 0, 0, -1]),
        270 => Some([0, -1, 1, 0]),
        _ => None,
    };
    if let Some(m) = matrix {
        dict.set(
            "Matrix",
            Object::Array(
                m.iter()
                    .map(|v| Object::Integer(*v))
                    .chain([0.into(), 0.into()])
                    .collect(),
            ),
        );
    }
    dict.set("Resources", Object::Dictionary(resources));
    Ok(alloc.add(Object::Stream(flate_stream(dict, &content))))
}

/// One-page PDF of `width` x `height` points showing the stamp; used for live previews in the UI.
pub fn preview_pdf(
    width: f64,
    height: f64,
    values: &StampValues,
    opts: &AppearanceOptions,
) -> Result<Vec<u8>> {
    let mut alloc = ObjAlloc::new(1);
    let xobj = build_appearance(&mut alloc, width, height, 0, values, opts)?;
    let mut doc = lopdf::Document::with_version("1.7");
    for (id, obj) in alloc.objects.drain(..) {
        doc.objects.insert(id, obj);
    }
    doc.max_id = alloc.next_id;
    let content = doc.add_object(Stream::new(Dictionary::new(), b"q /S Do Q".to_vec()));
    let mut xobjs = Dictionary::new();
    xobjs.set("S", Object::Reference(xobj));
    let mut res = Dictionary::new();
    res.set("XObject", Object::Dictionary(xobjs));
    let pages_id = doc.new_object_id();
    let mut page = Dictionary::new();
    page.set("Type", Object::Name(b"Page".to_vec()));
    page.set("Parent", Object::Reference(pages_id));
    page.set(
        "MediaBox",
        Object::Array(vec![
            0.into(),
            0.into(),
            Object::Real(width as f32),
            Object::Real(height as f32),
        ]),
    );
    page.set("Resources", Object::Dictionary(res));
    page.set("Contents", Object::Reference(content));
    let page_id = doc.add_object(Object::Dictionary(page));
    let mut pages = Dictionary::new();
    pages.set("Type", Object::Name(b"Pages".to_vec()));
    pages.set("Kids", Object::Array(vec![Object::Reference(page_id)]));
    pages.set("Count", Object::Integer(1));
    doc.objects.insert(pages_id, Object::Dictionary(pages));
    let mut catalog = Dictionary::new();
    catalog.set("Type", Object::Name(b"Catalog".to_vec()));
    catalog.set("Pages", Object::Reference(pages_id));
    let catalog_id = doc.add_object(Object::Dictionary(catalog));
    doc.trailer.set("Root", Object::Reference(catalog_id));
    let mut out = Vec::new();
    doc.save_to(&mut out)?;
    Ok(out)
}

fn circle_path(cx: f64, cy: f64, r: f64) -> String {
    let k = 0.552_284_749_831 * r;
    let f = fmt_real;
    format!(
        "{} {} m {} {} {} {} {} {} c {} {} {} {} {} {} c {} {} {} {} {} {} c {} {} {} {} {} {} c h",
        f(cx + r),
        f(cy),
        f(cx + r),
        f(cy + k),
        f(cx + k),
        f(cy + r),
        f(cx),
        f(cy + r),
        f(cx - k),
        f(cy + r),
        f(cx - r),
        f(cy + k),
        f(cx - r),
        f(cy),
        f(cx - r),
        f(cy - k),
        f(cx - k),
        f(cy - r),
        f(cx),
        f(cy - r),
        f(cx + k),
        f(cy - r),
        f(cx + r),
        f(cy - k),
        f(cx + r),
        f(cy),
    )
}

pub(crate) fn flate_stream(mut dict: Dictionary, data: &[u8]) -> Stream {
    let mut enc = ZlibEncoder::new(Vec::new(), Compression::default());
    let _ = enc.write_all(data);
    let compressed = enc.finish().unwrap_or_default();
    dict.set("Filter", Object::Name(b"FlateDecode".to_vec()));
    Stream::new(dict, compressed).with_compression(false)
}

fn embed_image(alloc: &mut ObjAlloc, bytes: &[u8]) -> Result<(ObjectId, f64, f64)> {
    let img = image::load_from_memory(bytes).map_err(|e| Error::Image(e.to_string()))?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let mut rgb = Vec::with_capacity((w * h * 3) as usize);
    let mut alpha = Vec::with_capacity((w * h) as usize);
    for px in rgba.pixels() {
        rgb.extend_from_slice(&px.0[..3]);
        alpha.push(px.0[3]);
    }
    let mut dict = Dictionary::new();
    dict.set("Type", Object::Name(b"XObject".to_vec()));
    dict.set("Subtype", Object::Name(b"Image".to_vec()));
    dict.set("Width", Object::Integer(w as i64));
    dict.set("Height", Object::Integer(h as i64));
    dict.set("BitsPerComponent", Object::Integer(8));
    dict.set("ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
    if alpha.iter().any(|a| *a != 255) {
        let mut sm = Dictionary::new();
        sm.set("Type", Object::Name(b"XObject".to_vec()));
        sm.set("Subtype", Object::Name(b"Image".to_vec()));
        sm.set("Width", Object::Integer(w as i64));
        sm.set("Height", Object::Integer(h as i64));
        sm.set("BitsPerComponent", Object::Integer(8));
        sm.set("ColorSpace", Object::Name(b"DeviceGray".to_vec()));
        let smask_id = alloc.add(Object::Stream(flate_stream(sm, &alpha)));
        dict.set("SMask", Object::Reference(smask_id));
    }
    let id = alloc.add(Object::Stream(flate_stream(dict, &rgb)));
    Ok((id, w as f64, h as f64))
}

fn embed_type0_font(
    alloc: &mut ObjAlloc,
    font: &TextFont,
    font_data: &[u8],
    remapper: &subsetter::GlyphRemapper,
    to_unicode: &BTreeMap<u16, char>,
    widths: &BTreeMap<u16, f64>,
) -> Result<ObjectId> {
    let subset =
        subsetter::subset(font_data, 0, remapper).map_err(|e| Error::Font(format!("{e:?}")))?;
    let ps_name = font
        .face
        .names()
        .into_iter()
        .find(|n| n.name_id == ttf_parser::name_id::POST_SCRIPT_NAME)
        .and_then(|n| n.to_string())
        .unwrap_or_else(|| "EmbeddedFont".into());
    let tag: String = {
        let h = to_unicode.keys().fold(0u64, |acc, g| {
            acc.wrapping_mul(31).wrapping_add(*g as u64 + 7)
        });
        (0..6)
            .map(|i| (b'A' + ((h >> (i * 5)) % 26) as u8) as char)
            .collect()
    };
    let base_font = format!("{tag}+{ps_name}");
    let scale = 1000.0 / font.upem;

    let mut ff = Dictionary::new();
    ff.set("Length1", Object::Integer(subset.len() as i64));
    let ff_id = alloc.add(Object::Stream(flate_stream(ff, &subset)));

    let bbox = font.face.global_bounding_box();
    let mut fd = Dictionary::new();
    fd.set("Type", Object::Name(b"FontDescriptor".to_vec()));
    fd.set("FontName", Object::Name(base_font.clone().into_bytes()));
    fd.set("Flags", Object::Integer(32));
    fd.set(
        "FontBBox",
        Object::Array(
            [bbox.x_min, bbox.y_min, bbox.x_max, bbox.y_max]
                .iter()
                .map(|v| Object::Integer((*v as f64 * scale).round() as i64))
                .collect(),
        ),
    );
    fd.set("ItalicAngle", Object::Integer(0));
    fd.set(
        "Ascent",
        Object::Integer((font.face.ascender() as f64 * scale).round() as i64),
    );
    fd.set(
        "Descent",
        Object::Integer((font.face.descender() as f64 * scale).round() as i64),
    );
    fd.set(
        "CapHeight",
        Object::Integer((font.face.capital_height().unwrap_or(700) as f64 * scale).round() as i64),
    );
    fd.set("StemV", Object::Integer(80));
    fd.set("FontFile2", Object::Reference(ff_id));
    let fd_id = alloc.add(Object::Dictionary(fd));

    let mut w_arr = Vec::new();
    for (gid, w) in widths {
        w_arr.push(Object::Integer(*gid as i64));
        w_arr.push(Object::Array(vec![Object::Integer(w.round() as i64)]));
    }
    let mut sys = Dictionary::new();
    sys.set("Registry", Object::string_literal("Adobe"));
    sys.set("Ordering", Object::string_literal("Identity"));
    sys.set("Supplement", Object::Integer(0));
    let mut cid = Dictionary::new();
    cid.set("Type", Object::Name(b"Font".to_vec()));
    cid.set("Subtype", Object::Name(b"CIDFontType2".to_vec()));
    cid.set("BaseFont", Object::Name(base_font.clone().into_bytes()));
    cid.set("CIDSystemInfo", Object::Dictionary(sys));
    cid.set("FontDescriptor", Object::Reference(fd_id));
    cid.set("DW", Object::Integer(1000));
    cid.set("W", Object::Array(w_arr));
    cid.set("CIDToGIDMap", Object::Name(b"Identity".to_vec()));
    let cid_id = alloc.add(Object::Dictionary(cid));

    let tu_id = alloc.add(Object::Stream(flate_stream(
        Dictionary::new(),
        &to_unicode_cmap(to_unicode),
    )));

    let mut t0 = Dictionary::new();
    t0.set("Type", Object::Name(b"Font".to_vec()));
    t0.set("Subtype", Object::Name(b"Type0".to_vec()));
    t0.set("BaseFont", Object::Name(base_font.into_bytes()));
    t0.set("Encoding", Object::Name(b"Identity-H".to_vec()));
    t0.set(
        "DescendantFonts",
        Object::Array(vec![Object::Reference(cid_id)]),
    );
    t0.set("ToUnicode", Object::Reference(tu_id));
    Ok(alloc.add(Object::Dictionary(t0)))
}

fn to_unicode_cmap(map: &BTreeMap<u16, char>) -> Vec<u8> {
    let mut s = String::from(
        "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n\
         /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n\
         /CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n\
         1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n",
    );
    let entries: Vec<_> = map.iter().filter(|(g, _)| **g != 0).collect();
    for chunk in entries.chunks(100) {
        s.push_str(&format!("{} beginbfchar\n", chunk.len()));
        for (gid, c) in chunk {
            let mut buf = [0u16; 2];
            let units: String = c
                .encode_utf16(&mut buf)
                .iter()
                .map(|u| format!("{u:04X}"))
                .collect();
            s.push_str(&format!("<{gid:04X}> <{units}>\n"));
        }
        s.push_str("endbfchar\n");
    }
    s.push_str("endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n");
    s.into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wraps_vietnamese_text() {
        let f = TextFont::new(DEFAULT_FONT).unwrap();
        let lines = f.wrap("CÔNG TY TNHH PHẦN MỀM ĐỒNG NAI VIỆT NAM", 80.0, 10.0);
        assert!(lines.len() > 1);
        for l in &lines {
            assert!(f.width(l, 10.0) <= 80.0 || !l.contains(' '));
        }
        assert_ne!(f.gid('Ư'), 0);
        assert_ne!(f.gid('ộ'), 0);
    }

    #[test]
    fn placeholders_drop_empty_lines() {
        let v = StampValues {
            name: "A".into(),
            reason: String::new(),
            ..Default::default()
        };
        assert_eq!(
            v.render_line("Ký bởi: {name}").as_deref(),
            Some("Ký bởi: A")
        );
        assert_eq!(v.render_line("Lý do: {reason}"), None);
        assert_eq!(v.render_line("Cố định").as_deref(), Some("Cố định"));
        assert_eq!(v.render_line("{unknown}").as_deref(), Some("{unknown}"));
    }

    #[test]
    fn builds_appearance_objects() {
        let mut alloc = ObjAlloc::new(100);
        let values = StampValues {
            name: "Nguyễn Văn A".into(),
            date: "14/11/2026 18:00:00".into(),
            ..Default::default()
        };
        let id =
            build_appearance(&mut alloc, 200.0, 60.0, 0, &values, &Default::default()).unwrap();
        assert!(alloc.objects.iter().any(|(oid, _)| *oid == id));
        assert!(alloc.objects.len() >= 6);
    }
}
