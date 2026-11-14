//! Minimal PDF object serializer for objects appended in an incremental update.

use lopdf::{Dictionary, Object, StringFormat};
use std::io::Write;

pub fn write_object(out: &mut Vec<u8>, obj: &Object) {
    match obj {
        Object::Null => out.extend_from_slice(b"null"),
        Object::Boolean(b) => out.extend_from_slice(if *b { b"true" } else { b"false" }),
        Object::Integer(i) => {
            let _ = write!(out, "{i}");
        }
        Object::Real(r) => write_real(out, *r as f64),
        Object::Name(n) => write_name(out, n),
        Object::String(s, fmt) => match fmt {
            StringFormat::Literal => write_literal_string(out, s),
            StringFormat::Hexadecimal => {
                out.push(b'<');
                out.extend_from_slice(hex::encode_upper(s).as_bytes());
                out.push(b'>');
            }
        },
        Object::Array(items) => {
            out.push(b'[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(b' ');
                }
                write_object(out, item);
            }
            out.push(b']');
        }
        Object::Dictionary(d) => write_dict(out, d),
        Object::Stream(s) => {
            let mut dict = s.dict.clone();
            dict.set("Length", Object::Integer(s.content.len() as i64));
            write_dict(out, &dict);
            out.extend_from_slice(b"\nstream\n");
            out.extend_from_slice(&s.content);
            out.extend_from_slice(b"\nendstream");
        }
        Object::Reference((id, gen)) => {
            let _ = write!(out, "{id} {gen} R");
        }
    }
}

pub fn write_dict(out: &mut Vec<u8>, d: &Dictionary) {
    out.extend_from_slice(b"<<");
    for (k, v) in d.iter() {
        write_name(out, k);
        out.push(b' ');
        write_object(out, v);
    }
    out.extend_from_slice(b">>");
}

pub fn write_real(out: &mut Vec<u8>, v: f64) {
    if v.fract() == 0.0 && v.abs() < 1e15 {
        let _ = write!(out, "{}", v as i64);
        return;
    }
    let s = format!("{v:.4}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    out.extend_from_slice(if s == "-0" { b"0" } else { s.as_bytes() });
}

pub fn fmt_real(v: f64) -> String {
    let mut out = Vec::new();
    write_real(&mut out, v);
    String::from_utf8(out).unwrap_or_default()
}

fn is_regular_name_char(c: u8) -> bool {
    (0x21..=0x7e).contains(&c) && !b"()<>[]{}/%#".contains(&c)
}

pub fn write_name(out: &mut Vec<u8>, n: &[u8]) {
    out.push(b'/');
    for &c in n {
        if is_regular_name_char(c) {
            out.push(c);
        } else {
            let _ = write!(out, "#{c:02X}");
        }
    }
}

pub fn write_literal_string(out: &mut Vec<u8>, s: &[u8]) {
    out.push(b'(');
    for &c in s {
        match c {
            b'(' | b')' | b'\\' => {
                out.push(b'\\');
                out.push(c);
            }
            b'\r' => out.extend_from_slice(b"\\r"),
            b'\n' => out.extend_from_slice(b"\\n"),
            _ => out.push(c),
        }
    }
    out.push(b')');
}

/// Encode a Rust string as a PDF text string (PDFDocEncoding when ASCII, else UTF-16BE with BOM).
pub fn text_string(s: &str) -> Object {
    if s.is_ascii() {
        Object::String(s.as_bytes().to_vec(), StringFormat::Literal)
    } else {
        let mut bytes = vec![0xFE, 0xFF];
        for u in s.encode_utf16() {
            bytes.extend_from_slice(&u.to_be_bytes());
        }
        Object::String(bytes, StringFormat::Hexadecimal)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_basic_objects() {
        let mut d = Dictionary::new();
        d.set("Type", Object::Name(b"Annot".to_vec()));
        d.set("Rect", Object::Array(vec![1.into(), Object::Real(2.5), Object::Reference((3, 0))]));
        d.set("T", Object::string_literal("a(b)"));
        d.set("N", Object::Name(b"A B".to_vec()));
        let mut out = Vec::new();
        write_dict(&mut out, &d);
        assert_eq!(
            String::from_utf8(out).unwrap(),
            "<</Type /Annot/Rect [1 2.5 3 0 R]/T (a\\(b\\))/N /A#20B>>"
        );
    }

    #[test]
    fn reals_are_compact() {
        assert_eq!(fmt_real(12.0), "12");
        assert_eq!(fmt_real(0.25), "0.25");
        assert_eq!(fmt_real(-0.00001), "0");
    }
}
