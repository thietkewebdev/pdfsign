//! Visible signature appearance (form XObject) with an embedded, subsetted Unicode font.
//!
//! Layouts mirror the pyHanko stamps in `desktop-signer/signer/sig_appearance.py`:
//! - `valid` (default): red border, red circle with white tick, "Ký bởi: ..." + "Thời gian: ...".
//! - `seal` (when an image is given): image on the left, signer + time text on the right.

use crate::error::{Error, Result};
use crate::pdfobj::fmt_real;
use flate2::{write::ZlibEncoder, Compression};
use lopdf::{Dictionary, Object, ObjectId, Stream};
use std::collections::BTreeMap;
use std::io::Write;
use unicode_normalization::UnicodeNormalization;

pub static DEFAULT_FONT: &[u8] = include_bytes!("../../../assets/fonts/NotoSans-Regular.ttf");

const PADDING: f64 = 6.0;
const GAP: f64 = 8.0;
const LINE_HEIGHT: f64 = 1.25;
const RED: (f64, f64, f64) = (0.937, 0.231, 0.384);
const SEAL_RED: (f64, f64, f64) = (0.863, 0.149, 0.149);
const GRAY: (f64, f64, f64) = (0.29, 0.34, 0.39);
pub const SIGNER_PREFIX: &str = "Ký bởi: ";
pub const TS_PREFIX: &str = "Thời gian: ";

#[derive(Debug, Clone, Default)]
pub struct AppearanceOptions {
    /// Name shown on the stamp. Defaults to subject O, else CN of the signing certificate.
    pub signer_name: Option<String>,
    /// Pre-formatted time text. Defaults to signing time in Asia/Ho_Chi_Minh, `dd/MM/yyyy HH:mm:ss`.
    pub time_text: Option<String>,
    /// PNG or JPEG bytes (seal / handwritten signature). Switches to the `seal` layout.
    pub image: Option<Vec<u8>>,
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
        Self { next_id, objects: Vec::new() }
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
            .map(|c| self.face.glyph_hor_advance(ttf_parser::GlyphId(self.gid(c))).unwrap_or(0) as f64)
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

/// Build the appearance form XObject and its resources. Returns the XObject id.
pub fn build_appearance(
    alloc: &mut ObjAlloc,
    width: f64,
    height: f64,
    rotation: i64,
    signer: &str,
    time_text: &str,
    opts: &AppearanceOptions,
) -> Result<ObjectId> {
    let font_data: &[u8] = opts.font.as_deref().unwrap_or(DEFAULT_FONT);
    let font = TextFont::new(font_data)?;
    let signer: String = signer.nfc().collect();
    let time_text: String = time_text.nfc().collect();

    let mut ops: Vec<String> = Vec::new();
    let mut runs: Vec<TextRun> = Vec::new();
    let mut resources = Dictionary::new();

    if let Some(img_bytes) = &opts.image {
        let (img_id, iw, ih) = embed_image(alloc, img_bytes)?;
        let avail_h = (height - 2.0 * PADDING).max(1.0);
        let img_area_w = (width * 0.45).min(avail_h);
        let scale = (img_area_w / iw).min(avail_h / ih);
        let (dw, dh) = (iw * scale, ih * scale);
        ops.push(format!(
            "q {} 0 0 {} {} {} cm /Im1 Do Q",
            fmt_real(dw),
            fmt_real(dh),
            fmt_real(PADDING),
            fmt_real((height - dh) / 2.0)
        ));
        let mut xobjs = Dictionary::new();
        xobjs.set("Im1", Object::Reference(img_id));
        resources.set("XObject", Object::Dictionary(xobjs));

        let text_x = PADDING + img_area_w + PADDING;
        let max_w = (width - text_x - PADDING).max(20.0);
        let signer_text = if signer.is_empty() { "—".to_string() } else { signer.clone() };
        let (mut size, mut s_lines, mut t_lines) = (6.0, Vec::new(), Vec::new());
        for fs in (6..=14).rev() {
            let fs = fs as f64;
            s_lines = font.wrap(&signer_text, max_w, fs);
            t_lines = font.wrap(&time_text, max_w, fs);
            size = fs;
            let needed = (s_lines.len() + t_lines.len()) as f64 * fs * LINE_HEIGHT
                + if t_lines.is_empty() { 0.0 } else { 2.0 };
            if needed <= avail_h {
                break;
            }
        }
        let leading = size * LINE_HEIGHT;
        let total = (s_lines.len() + t_lines.len()) as f64 * leading + if t_lines.is_empty() { 0.0 } else { 2.0 };
        let mut y = (height + total) / 2.0;
        for line in s_lines {
            runs.push(TextRun { text: line, x: text_x, y: y - size, size, color: SEAL_RED });
            y -= leading;
        }
        if !t_lines.is_empty() {
            y -= 2.0;
        }
        for line in t_lines {
            runs.push(TextRun { text: line, x: text_x, y: y - size, size, color: GRAY });
            y -= leading;
        }
    } else {
        let icon = (height * 0.55).clamp(18.0, 40.0);
        let text_x = PADDING + icon + GAP;
        let max_w = (width - 2.0 * PADDING - icon - GAP).max(0.0);
        let start_size = (height * 0.16).round().clamp(4.0, 12.0) as i64;
        let signer_text = format!("{SIGNER_PREFIX}{signer}");
        let ts_text = format!("{TS_PREFIX}{time_text}");
        let avail_h = height - 2.0 * PADDING;
        let (mut size, mut s_lines, mut t_lines) = (4.0, Vec::new(), Vec::new());
        for fs in (4..=start_size).rev() {
            let fs = fs as f64;
            s_lines = font.wrap(&signer_text, max_w, fs);
            t_lines = font.wrap(&ts_text, max_w, fs);
            size = fs;
            if (s_lines.len() + t_lines.len()) as f64 * fs * LINE_HEIGHT <= avail_h {
                break;
            }
        }

        ops.push(format!(
            "q 1 w {} {} {} RG {} {} {} {} re S Q",
            RED.0,
            RED.1,
            RED.2,
            fmt_real(PADDING),
            fmt_real(PADDING),
            fmt_real(width - 2.0 * PADDING),
            fmt_real(height - 2.0 * PADDING)
        ));
        let (cx, cy, r) = (PADDING + icon / 2.0, height / 2.0, icon / 2.0 - 2.0);
        ops.push(format!("q {} {} {} rg {} f Q", RED.0, RED.1, RED.2, circle_path(cx, cy, r)));
        ops.push(format!(
            "q 1 1 1 RG 2 w 1 J 1 j {} {} m {} {} l {} {} l S Q",
            fmt_real(cx - 0.40 * r),
            fmt_real(cy + 0.05 * r),
            fmt_real(cx - 0.15 * r),
            fmt_real(cy - 0.25 * r),
            fmt_real(cx + 0.45 * r),
            fmt_real(cy + 0.30 * r)
        ));

        let leading = size * LINE_HEIGHT;
        let block_h = (s_lines.len() + t_lines.len()) as f64 * leading;
        let mut y = (PADDING + size).max((height + block_h) / 2.0 - size);
        for line in s_lines {
            runs.push(TextRun { text: line, x: text_x, y, size, color: RED });
            y -= leading;
        }
        for line in t_lines {
            runs.push(TextRun { text: line, x: text_x, y, size, color: GRAY });
            y -= leading;
        }
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
                let adv = font.face.glyph_hor_advance(ttf_parser::GlyphId(gid)).unwrap_or(0) as f64;
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
        Object::Array(vec![0.into(), 0.into(), Object::Real(width as f32), Object::Real(height as f32)]),
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
            Object::Array(m.iter().map(|v| Object::Integer(*v)).chain([0.into(), 0.into()]).collect()),
        );
    }
    dict.set("Resources", Object::Dictionary(resources));
    Ok(alloc.add(Object::Stream(flate_stream(dict, &content))))
}

fn circle_path(cx: f64, cy: f64, r: f64) -> String {
    let k = 0.552_284_749_831 * r;
    let f = fmt_real;
    format!(
        "{} {} m {} {} {} {} {} {} c {} {} {} {} {} {} c {} {} {} {} {} {} c {} {} {} {} {} {} c h",
        f(cx + r), f(cy),
        f(cx + r), f(cy + k), f(cx + k), f(cy + r), f(cx), f(cy + r),
        f(cx - k), f(cy + r), f(cx - r), f(cy + k), f(cx - r), f(cy),
        f(cx - r), f(cy - k), f(cx - k), f(cy - r), f(cx), f(cy - r),
        f(cx + k), f(cy - r), f(cx + r), f(cy - k), f(cx + r), f(cy),
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
    let subset = subsetter::subset(font_data, 0, remapper).map_err(|e| Error::Font(format!("{e:?}")))?;
    let ps_name = font
        .face
        .names()
        .into_iter()
        .find(|n| n.name_id == ttf_parser::name_id::POST_SCRIPT_NAME)
        .and_then(|n| n.to_string())
        .unwrap_or_else(|| "EmbeddedFont".into());
    let tag: String = {
        let h = to_unicode.keys().fold(0u64, |acc, g| acc.wrapping_mul(31).wrapping_add(*g as u64 + 7));
        (0..6).map(|i| (b'A' + ((h >> (i * 5)) % 26) as u8) as char).collect()
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
    fd.set("Ascent", Object::Integer((font.face.ascender() as f64 * scale).round() as i64));
    fd.set("Descent", Object::Integer((font.face.descender() as f64 * scale).round() as i64));
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

    let tu_id = alloc.add(Object::Stream(flate_stream(Dictionary::new(), &to_unicode_cmap(to_unicode))));

    let mut t0 = Dictionary::new();
    t0.set("Type", Object::Name(b"Font".to_vec()));
    t0.set("Subtype", Object::Name(b"Type0".to_vec()));
    t0.set("BaseFont", Object::Name(base_font.into_bytes()));
    t0.set("Encoding", Object::Name(b"Identity-H".to_vec()));
    t0.set("DescendantFonts", Object::Array(vec![Object::Reference(cid_id)]));
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
            let units: String = c.encode_utf16(&mut buf).iter().map(|u| format!("{u:04X}")).collect();
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
    fn builds_appearance_objects() {
        let mut alloc = ObjAlloc::new(100);
        let id = build_appearance(&mut alloc, 200.0, 60.0, 0, "Nguyễn Văn A", "14/11/2026 18:00:00", &Default::default())
            .unwrap();
        assert!(alloc.objects.iter().any(|(oid, _)| *oid == id));
        assert!(alloc.objects.len() >= 6);
    }
}
